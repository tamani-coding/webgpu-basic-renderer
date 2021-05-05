import { RenderObject } from './objects';
import { mat4, vec3 } from 'gl-matrix';


export class Scene {

    private objects: RenderObject[] = [];

    private lightProjectionMatrix = mat4.create();

    public lightPosition = vec3.fromValues(0, -50, 50);
    private origin = vec3.fromValues(0, 0, 0);
    private upVector = vec3.fromValues(0, 1, 0);
    private lightViewMatrix = mat4.create();
    private lightViewProjMatrix = mat4.create();

    constructor() {
    }

    public add(object: RenderObject) {
        this.objects.push(object);
    }

    public getObjects(): RenderObject[] {
        return this.objects;
    }

    public getLightMatrixData(): Float32Array {
        const left = -80;
        const right = 80;
        const bottom = -80;
        const top = 80;
        const near = 5;
        const far = 500;
        mat4.ortho(this.lightProjectionMatrix, left, right, bottom, top, near, far);

        mat4.lookAt(this.lightViewMatrix, this.lightPosition, this.origin, this.upVector);
        mat4.multiply(this.lightViewProjMatrix, this.lightProjectionMatrix, this.lightViewMatrix);
        return this.lightViewProjMatrix as Float32Array;
    }

    public getLightPosition(): Float32Array {
        return this.lightPosition as Float32Array;
    }
}