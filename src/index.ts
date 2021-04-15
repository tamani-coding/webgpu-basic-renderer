import { RenderObject } from './objects';
import { Scene } from './scene';
import { Camera } from './camera';
import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)

let stopRunning = false;

const camera = new Camera(outputCanvas.width / outputCanvas.height);
camera.z = -7
const scene = new Scene();

const renderer = new WebGpuRenderer();
renderer.init(outputCanvas).then((success) => {

    scene.add(RenderObject.cube({ x: -2, y: 1 }));
    scene.add(RenderObject.pyramid({ x: 2 }))

    const doFrame = () => {
        if (!success || stopRunning) return;

        // ANIMATE
        const now = Date.now() / 1000;

        for (let object of scene.getObjects()) {
            object.rotX = Math.sin(now)
            object.rotZ = Math.cos(now)
        }

        // camera.rotX = Math.cos(now / 5) * Math.PI * 2
        // camera.rotY = Math.sin(now / 5) * Math.PI * 2

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

function addCube() {
    scene.add(RenderObject.cube({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 }));
}

function addPyramid() {
    scene.add(RenderObject.pyramid({ x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }));
}

const boxB = document.createElement('button')
boxB.textContent = "ADD BOX"
boxB.classList.add('cubeButton')
boxB.onclick = addCube
document.body.appendChild(boxB)

const pyramidB = document.createElement('button')
pyramidB.textContent = "ADD PYRAMID"
pyramidB.classList.add('pyramidButton')
pyramidB.onclick = addPyramid
document.body.appendChild(pyramidB)