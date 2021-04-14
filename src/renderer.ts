import { Scene } from './scene';
import { Camera } from './camera';

export var device: GPUDevice;

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

        device = await this.gpuDevice();

        const context = canvas.getContext('gpupresent');
        this.swapChain = context.configureSwapChain({
            device: device,
            format: this.swapChainFormat,
        });

        const depthTextureView = this.depthTextureView(canvas);
        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    // attachment is acquired and set in render loop.
                    attachment: undefined,
                    loadValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
                },
            ],
            depthStencilAttachment: {
                attachment: depthTextureView,

                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            },
        };

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.UpdateRenderPassDescriptor(canvas);
    }

    public frame(camera: Camera, scene: Scene) {
        if (!this.initSuccess) {
            return;
        }

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentDescriptor])[0].attachment = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of scene.getObjects()) {
            object.draw(passEncoder, device, camera.getViewMatrix(), camera.getProjectionMatrix())
        }

        passEncoder.endPass();
        device.queue.submit([commandEncoder.finish()]);
    }

    private async gpuDevice() {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            console.log('NO WEBGPU FOUND')
            return;
        }
        return await adapter.requestDevice();
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

    private UpdateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        this.renderPassDescriptor.depthStencilAttachment.attachment = this.depthTextureView(canvas);
    }
}