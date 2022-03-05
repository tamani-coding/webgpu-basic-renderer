import { Scene } from './scene';
import { Camera } from './camera';

export var device: GPUDevice;

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    private initSuccess: boolean = false;
    private renderPassDescriptor: GPURenderPassDescriptor;
    private context: GPUCanvasContext;
    private presentationFormat: GPUTextureFormat;
    private presentationSize: number[];

    constructor() { }

    public async init(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!canvas) {
            console.log('missing canvas!')
            return false;
        }

        const adapter = await navigator.gpu.requestAdapter();
        device = await adapter.requestDevice();

        if (!device) {
            console.log('found no gpu device!')
            return false;
        }

        this.context = canvas.getContext('webgpu');

        this.presentationFormat = this.context.getPreferredFormat(adapter);
        this.presentationSize = [
            canvas.clientWidth * devicePixelRatio,
            canvas.clientHeight  * devicePixelRatio,
        ];

        this.context.configure({
            device,
            format: this.presentationFormat,
            size: this.presentationSize,
        });
        

        const depthTextureView = this.depthTextureView(canvas);
        this.renderPassDescriptor = {
            colorAttachments: [
                {
                    // attachment is acquired and set in render loop.
                    view: undefined,
                    loadOp: 'clear',
                    clearValue: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
                    storeOp: 'store'
                } as GPURenderPassColorAttachment,
            ],
            depthStencilAttachment: {
                view: depthTextureView,

                depthLoadOp: 'clear',
                depthClearValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadOp: 'load',
                stencilStoreOp: 'store',
            } as GPURenderPassDepthStencilAttachment,
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

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment])[0].view = this.context
            .getCurrentTexture()
            .createView();

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);

        for (let object of scene.getObjects()) {
            object.draw(passEncoder, device, camera)
        }

        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);
    }

    private depthTextureView(canvas: HTMLCanvasElement) {
        return device.createTexture({
            size: this.presentationSize,
            format: 'depth24plus-stencil8',
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        }).createView();
    }

    private updateRenderPassDescriptor(canvas: HTMLCanvasElement) {
        (this.renderPassDescriptor.depthStencilAttachment as GPURenderPassDepthStencilAttachment).view = this.depthTextureView(canvas);
    }
}