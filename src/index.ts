import { init } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

window.onresize = () => {
    outputCanvas.width = window.innerWidth
    outputCanvas.height = window.innerHeight
}

let stopRunning = false;
init(outputCanvas).then((frame) => {
    const doFrame = () => {
        if (stopRunning) return;

        frame();
        requestAnimationFrame(doFrame);
    };
    requestAnimationFrame(doFrame);
});