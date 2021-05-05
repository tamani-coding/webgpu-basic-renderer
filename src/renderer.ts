import { Scene } from './scene';
import { Camera } from './camera';

export var device: GPUDevice;

export async function init(): Promise<void> {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.log('NO WEBGPU FOUND')
        return;
    }
    device = await adapter.requestDevice();
}

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    private initSuccess: boolean = false;
    private swapChain: GPUSwapChain;
    private renderPassDescriptor: GPURenderPassDescriptor;

    constructor() { }

    public async init(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!canvas) {
            console.log('missing canvas!')
            return false;
        }

        if (!device) {
            console.log('found no gpu device!')
            return false;
        }

        this.swapChain = canvas.getContext('gpupresent').configureSwapChain({
            device: device,
            format: this.swapChainFormat,
        });

        const depthTextureView = this.depthTextureView(canvas);
        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    // attachment is acquired and set in render loop.
                    view: undefined,
                    loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
                } as GPURenderPassColorAttachmentNew,
            ],
            depthStencilAttachment: {
                view: depthTextureView,

                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            } as GPURenderPassDepthStencilAttachmentNew,
        };

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.updateRenderPassDescriptor(canvas);
    }

    public frame(camera: Camera, scene: Scene) {
        if (!this.initSuccess) {
            return;
        }

        const sceneUniformBuffer = scene.getSceneUniformBuffer();
        const cameraViewProj = camera.getCameraViewProjMatrix() as Float32Array;
        const lightMatrixData = scene.getLightMatrixData();
        const lightData = scene.getLightPosition();

        device.queue.writeBuffer(
            sceneUniformBuffer,
            0,
            lightMatrixData.buffer,
            lightMatrixData.byteOffset,
            lightMatrixData.byteLength
        );
        device.queue.writeBuffer(
            sceneUniformBuffer,
            64,
            cameraViewProj.buffer,
            cameraViewProj.byteOffset,
            cameraViewProj.byteLength
        );
        device.queue.writeBuffer(
            sceneUniformBuffer,
            128,
            lightData.buffer,
            lightData.byteOffset,
            lightData.byteLength
        );

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentNew])[0].view = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();

        // shadow pass
        const shadowPass = commandEncoder.beginRenderPass(scene.getShadowPassDescriptor());
        for (let object of scene.getObjects()) {
            object.shadow(shadowPass)
        }
        // scene.getObjects()[0].shadow(shadowPass)
        shadowPass.endPass();

        // render pass
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        for (let object of scene.getObjects()) {
            object.draw(passEncoder, device, scene.getSceneBindGroupForRender())
        }
        // scene.getObjects()[0].draw(passEncoder, device, scene.getSceneBindGroupForRender(), camera)
        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
    }

    private depthTextureView(canvas: HTMLCanvasElement) {
        return device.createTexture({
            size: {
                width: canvas.width,
                height: canvas.height,
            },
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }).createView();
    }

    private updateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        (this.renderPassDescriptor.depthStencilAttachment as GPURenderPassDepthStencilAttachmentNew).view = this.depthTextureView(canvas);
    }
}