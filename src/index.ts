import { Camera } from './camera';
import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

let stopRunning = false;

const renderer = new WebGpuRenderer();
const camera = new Camera(outputCanvas.width / outputCanvas.height);
camera.z = -7

renderer.init(outputCanvas).then((success) => {
    const doFrame = () => {
        if (!success || stopRunning) return;

        renderer.frame(camera);
        requestAnimationFrame(doFrame);
    };
    requestAnimationFrame(doFrame);
});

window.onresize = () => {
    outputCanvas.width = window.innerWidth;
    outputCanvas.height = window.innerHeight;
    camera.aspect = outputCanvas.width / outputCanvas.height;
    renderer.update(outputCanvas);
}

outputCanvas.onwheel = (event: WheelEvent) => {
    camera.z -= event.deltaY / 100
}
