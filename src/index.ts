import { RenderObject } from './objects';
import { Scene } from './scene';
import { Camera } from './camera';
import { WebGpuRenderer } from './renderer'

const outputCanvas = document.createElement('canvas')
outputCanvas.width = window.innerWidth
outputCanvas.height = window.innerHeight
document.body.appendChild(outputCanvas)


const camera = new Camera(outputCanvas.width / outputCanvas.height);
camera.z = -7
const scene = new Scene();

const renderer = new WebGpuRenderer();
renderer.init(outputCanvas).then((success) => {
    if (!success) return;

    scene.add(RenderObject.cube({ x: -2, y: 1 }));
    scene.add(RenderObject.pyramid({ x: 2 }))

    const doFrame = () => {
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


function addCube() {
    scene.add(RenderObject.cube({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 10 }));
}

function addPyramid() {
    scene.add(RenderObject.pyramid({ x: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }));
}


// BUTTONS
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


// MOUSE CONTROLS

// ZOOM
outputCanvas.onwheel = (event: WheelEvent) => {
    camera.z -= event.deltaY / 100
}

// MOUSE DRAG
var mouseDown = false;
outputCanvas.onmousedown = (event: MouseEvent) => {
    mouseDown = true;

    lastMouseX = event.pageX;
    lastMouseY = event.pageY;
}
outputCanvas.onmouseup = (event: MouseEvent) => {
    mouseDown = false;
}
var lastMouseX=-1; 
var lastMouseY=-1;
outputCanvas.onmousemove = (event: MouseEvent) => {
    if (!mouseDown) {
        return;
    }

    var mousex = event.pageX;
    var mousey = event.pageY;

    if (lastMouseX > 0 && lastMouseY > 0) {
        const roty = mousex - lastMouseX;
        const rotx = mousey - lastMouseY;

        camera.rotY += roty / 100;
        camera.rotX += rotx / 100;
    }

    lastMouseX = mousex;
    lastMouseY = mousey;
}