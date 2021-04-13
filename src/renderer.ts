import { mat4, vec3 } from 'gl-matrix';
import { RenderObject } from './objects';

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    // readonly uniformBufferSize = 4 * 16; // 4x4 matrix

    private initSuccess: boolean = false;
    private zoomDelta: number = -5;

    private device: GPUDevice;
    private swapChain: GPUSwapChain;
    private renderPassDescriptor: GPURenderPassDescriptor;

    private projectionMatrix = mat4.create();
    private viewMatrix = mat4.create();

    private objects: RenderObject[] = [];


    constructor() {
        mat4.translate(this.viewMatrix, this.viewMatrix, vec3.fromValues(0, 0, -5));
    }

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

        this.updateProjectionMatrix(canvas);

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

        this.objects.push(RenderObject.cube(this.device, { x: -2 }))
        this.objects.push(RenderObject.pyramid(this.device, { x: 2 }))

        return this.initSuccess = true;
    }

    public update(canvas: HTMLCanvasElement) {
        if (!this.initSuccess) {
            return;
        }

        this.updateProjectionMatrix(canvas);
        this.UpdateRenderPassDescriptor(canvas);
    }

    public frame() {
        if (!this.initSuccess) {
            return;
        }

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentDescriptor])[0].attachment = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of this.objects) {
            object.draw(passEncoder, this.device, this.viewMatrix, this.projectionMatrix)
        }

        passEncoder.endPass();
        this.device.queue.submit([commandEncoder.finish()]);
    }

    public zoom(delta: number) {
        this.zoomDelta += delta;
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

    private updateProjectionMatrix(canvas: HTMLCanvasElement) {
        const aspect = Math.abs(canvas.width / canvas.height);
        mat4.perspective(this.projectionMatrix, (2 * Math.PI) / 5, aspect, 1, 100.0);
    }

    private UpdateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        this.renderPassDescriptor.depthStencilAttachment.attachment = this.depthTextureView(canvas);
    }
}