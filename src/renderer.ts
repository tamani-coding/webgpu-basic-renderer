import { Camera } from './camera';
import { mat4, vec3 } from 'gl-matrix';
import { RenderObject } from './objects';

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    // readonly uniformBufferSize = 4 * 16; // 4x4 matrix

    private initSuccess: boolean = false;

    private device: GPUDevice;
    private swapChain: GPUSwapChain;
    private renderPassDescriptor: GPURenderPassDescriptor;

    private objects: RenderObject[] = [];


    constructor() { }

    public async init(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!canvas) {
            console.log('missing canvas!')
            return false;
        }

        this.device = await this.gpuDevice();

        const context = canvas.getContext('gpupresent');
        this.swapChain = context.configureSwapChain({
            device: this.device,
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

        this.objects.push(RenderObject.cube(this.device, { x: -2, y: 1 }))
        this.objects.push(RenderObject.pyramid(this.device, { x: 2 }))

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.UpdateRenderPassDescriptor(canvas);
    }

    public frame(camera: Camera) {
        if (!this.initSuccess) {
            return;
        }

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentDescriptor])[0].attachment = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of this.objects) {
            object.draw(passEncoder, this.device, camera.getViewMatrix(), camera.getProjectionMatrix())
        }

        passEncoder.endPass();
        this.device.queue.submit([commandEncoder.finish()]);
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
        return this.device.createTexture({
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