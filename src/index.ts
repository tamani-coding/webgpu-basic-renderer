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
        
        camera.rotX = Math.cos(now / 5) * Math.PI * 2
        camera.rotY = Math.sin(now / 5) * Math.PI * 2
        // camera.rotZ = Math.cos(now)

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
    let box = RenderObject.cube({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 });
    scene.add(box);
}

function addPyramid() {
    let pyramid = RenderObject.pyramid({ x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 });
    scene.add(pyramid);
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