import { RenderObject } from './objects';
import { Scene } from './scene';
import { Camera } from './camera';
import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

let stopRunning = false;

const renderer = new WebGpuRenderer();
const camera = new Camera(outputCanvas.width / outputCanvas.height);
const scene = new Scene();
camera.z = -7

renderer.init(outputCanvas).then((success) => {

    let box = RenderObject.cube({ x: -2, y: 1 });
    scene.add(box);
    let pyramid = RenderObject.pyramid({ x: 2 });
    scene.add(pyramid)

    const doFrame = () => {
        if (!success || stopRunning) return;

        // ANIMATE
        const now = Date.now() / 1000;

        box.rotX = Math.sin(now)
        box.rotZ = Math.cos(now)

        pyramid.rotX = Math.cos(now)
        pyramid.rotZ = Math.sin(now)

        renderer.frame(camera, scene);
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
