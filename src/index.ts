import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

let stopRunning = false;

const renderer = new WebGpuRenderer();

renderer.init(outputCanvas).then((success) => {
    const doFrame = () => {
        if (!success || stopRunning) return;

        renderer.frame();
        requestAnimationFrame(doFrame);
    };
    requestAnimationFrame(doFrame);
});

window.onresize = () => {
    outputCanvas.width = window.innerWidth;
    outputCanvas.height = window.innerHeight;
    renderer.update(outputCanvas);
}

outputCanvas.onwheel = (event: WheelEvent) => {
    renderer.zoom(- event.deltaY / 100)
}
