// FILE INPUT
const input = document.createElement('input')
input.type = 'file'
input.addEventListener("change", imageSelected, false);
document.body.appendChild(input)

document.body.appendChild(document.createElement('br'))

// INPUT IMAGE
const inputImage = document.createElement('img')
document.body.appendChild(inputImage)

// OUTPUT IMAGE
const outputImage = document.createElement('img')
document.body.appendChild(outputImage)

function imageSelected(event: Event) {
    const files = this.files;

    if (!files || files.length < 1) {
        return;
    }

    const dataUrlReader = new FileReader();
    dataUrlReader.addEventListener("load", function () {
        // convert image file to base64 string
        inputImage.src = dataUrlReader.result as string
    }, false);
    dataUrlReader.readAsDataURL(files[0])

    const arrayReader = new FileReader();
    arrayReader.addEventListener("load", function () {
        // process image with webgpu
        processImage(arrayReader.result as ArrayBuffer).then( result => {
            let processed = 'data:' + files[0].type + ';base64,'

            let binary = '';
            var bytes = new Uint8Array( result );
            var len = bytes.byteLength;
            for (var i = 0; i < len; i++) {
                binary += String.fromCharCode( bytes[ i ] );
            }

            processed += window.btoa(binary);
            console.log(processed)

            outputImage.src = processed
        });
    }, false);
    arrayReader.readAsArrayBuffer(files[0])
}

async function gpuDevice() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.log('NO WEBGPU FOUND')
        return;
    }
    return await adapter.requestDevice();
}
const device = gpuDevice();

function processImage(array: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise(
        resolve => {
            gpuDevice().then((device: GPUDevice) => {
                if (!device) {
                    console.log('NO GPU DEVICE');
                    return;
                }

                let inputArray = Array.from(new Uint8Array(array))
                console.log('org. length ' + inputArray.length)
                const pad = 4 - (inputArray.length % 4);
                if (pad != 4) { // must be multiple of 4
                    console.log('modulo ' + pad)
                    for (let i = 0; i < pad; i++) {
                        inputArray.push(0)
                    }
                }

                console.log('byte length ' + inputArray.length)
                // Get a GPU buffer in a mapped state and an arrayBuffer for writing.
                const gpuWriteBuffer = device.createBuffer({
                    mappedAtCreation: true,
                    size: inputArray.length,
                    usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC
                });
                const arrayBuffer = gpuWriteBuffer.getMappedRange();

                // Write bytes to buffer.
                new Uint8Array(arrayBuffer).set(inputArray);

                // Unmap buffer so that it can be used later for copy.
                gpuWriteBuffer.unmap();

                // Get a GPU buffer for reading in an unmapped state.
                const gpuReadBuffer = device.createBuffer({
                    size: inputArray.length,
                    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
                });

                // Encode commands for copying buffer to buffer.
                const copyEncoder = device.createCommandEncoder();
                copyEncoder.copyBufferToBuffer(
                    gpuWriteBuffer /* source buffer */,
                    0 /* source offset */,
                    gpuReadBuffer /* destination buffer */,
                    0 /* destination offset */,
                    inputArray.length /* size */
                );

                // Submit copy commands.
                const copyCommands = copyEncoder.finish();
                device.queue.submit([copyCommands]);

                // Read buffer.
                gpuReadBuffer.mapAsync(GPUMapMode.READ).then(() => {
                    const copyArrayBuffer = gpuReadBuffer.getMappedRange();
                    console.log('got result')

                    if (pad != 4) {
                        resolve(copyArrayBuffer.slice(0, copyArrayBuffer.byteLength - pad))
                    } else {
                        resolve(copyArrayBuffer)
                    }
                });
            })
        }
    );
}