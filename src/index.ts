const CANVAS_WIDTH = 500;
const CANVAS_HEIGHT = 300;

// FILE INPUT
const input = document.createElement('input')
input.type = 'file'
input.addEventListener("change", imageSelected, false);
document.body.appendChild(input)

document.body.appendChild(document.createElement('br'))

// INPUT IMAGE
const inputImage = document.createElement('img')

const inputCanvas = document.createElement('canvas')
inputCanvas.width = CANVAS_WIDTH
inputCanvas.height = CANVAS_HEIGHT
document.body.appendChild(inputCanvas)

document.body.appendChild(document.createElement('br'))

const outputCanvas = document.createElement('canvas')
outputCanvas.width = CANVAS_WIDTH
outputCanvas.height = CANVAS_HEIGHT
document.body.appendChild(outputCanvas)
// const context = outputCanvas.getContext('gpupresent');
// const swapChainFormat = 'bgra8unorm';

function imageSelected(event: Event) {
    const files = this.files;

    if (!files || files.length < 1) {
        return;
    }

    const dataUrlReader = new FileReader();
    dataUrlReader.addEventListener("load", function () {
        // convert image file to base64 string
        inputImage.src = dataUrlReader.result as string

        inputImage.onload = () => {
            const context = inputCanvas.getContext("2d");

            context.drawImage(inputImage, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
            var imgData = context.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

            processImage(imgData.data).then((result) => {
                console.log('ready')
                outputCanvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(result), CANVAS_WIDTH, CANVAS_HEIGHT), 0, 0)
            })
        }
    }, false);
    dataUrlReader.readAsDataURL(files[0])
}

async function gpuDevice() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.log('NO WEBGPU FOUND')
        return;
    }
    return await adapter.requestDevice();
}

function processImage(array: ArrayBuffer): Promise<ArrayBuffer> {
    return new Promise(
        resolve => {
            gpuDevice().then((device: GPUDevice) => {
                if (!device) {
                    console.log('NO GPU DEVICE');
                    return;
                }

                // NORMALIZE ARRAY
                let inputArray = Array.from(new Uint8Array(array))
                const pad = 4 - (inputArray.length % 4);
                if (pad != 4) { // must be multiple of 4
                    console.log('modulo ' + pad)
                    for (let i = 0; i < pad; i++) {
                        inputArray.push(0)
                    }
                }

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