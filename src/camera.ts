import { mat4, vec3 } from 'gl-matrix';

export class Camera {

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    public rotX: number = 0;
    public rotY: number = 0;
    public rotZ: number = 0;

    public fovy: number = (2 * Math.PI) / 5;
    public aspect: number = 16 / 9;

    public near: number = 1;
    public far: number = 1000;

    constructor (aspect: number) {
        this.aspect = aspect;
    }

    public getViewMatrix () : mat4 {
        let viewMatrix = mat4.create();

        mat4.lookAt(viewMatrix, vec3.fromValues(this.x, this.y, this.z), vec3.fromValues(0, 0, 0), vec3.fromValues(0, 1, 0));

        mat4.rotateX(viewMatrix, viewMatrix, this.rotX);
        mat4.rotateY(viewMatrix, viewMatrix, this.rotY);
        mat4.rotateZ(viewMatrix, viewMatrix, this.rotZ);
        return viewMatrix;
    }

    public getProjectionMatrix () : mat4 {
        let projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, this.fovy, this.aspect, this.near, this.far);
        return projectionMatrix;
    }

    public getCameraViewProjMatrix () : mat4 {
        const viewProjMatrix = mat4.create();
        const view = this.getViewMatrix();
        const proj = this.getProjectionMatrix();
        mat4.multiply(viewProjMatrix, proj, view);
        return viewProjMatrix;
    }
}