import { mat4, vec3 } from 'gl-matrix';
import { cubeVertexArray, cubeVertexSize, cubePositionOffset, cubeColorOffset, cubeVertexCount } from './vertices'

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    readonly uniformBufferSize = 4 * 16; // 4x4 matrix
    readonly projectionMatrix = mat4.create();

    private initSuccess: boolean = false;
    private zoomDelta: number = -5;

    private device: GPUDevice;
    private swapChain: GPUSwapChain;
    private uniformBuffer: GPUBuffer;
    private uniformBindGroup: GPUBindGroup;
    private renderPassDescriptor: GPURenderPassDescriptor;
    private pipeline: GPURenderPipeline;
    private verticesBuffer: GPUBuffer;

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

        this.verticesBuffer = this.device.createBuffer({
            size: cubeVertexArray.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.verticesBuffer.getMappedRange()).set(cubeVertexArray);
        this.verticesBuffer.unmap();

        this.pipeline = this.device.createRenderPipeline({
            vertex: {
                module: this.device.createShaderModule({
                    code: wgslShaders.vertex,
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: cubeVertexSize,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: cubePositionOffset,
                                format: 'float32x4',
                            },
                            {
                                // color
                                shaderLocation: 1,
                                offset: cubeColorOffset,
                                format: 'float32x4',
                            },
                        ],
                    } as GPUVertexBufferLayout,
                ],
            },
            fragment: {
                module: this.device.createShaderModule({
                    code: wgslShaders.fragment,
                }),
                entryPoint: 'main',
                targets: [
                    {
                        format: 'bgra8unorm' as GPUTextureFormat,
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
                cullMode: 'back',
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth24plus-stencil8',
            },
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

        this.uniformBuffer = this.device.createBuffer({
            size: this.uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.uniformBindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                    },
                },
            ],
        });

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

        const transformationMatrix = this.getTransformationMatrix();
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            transformationMatrix.buffer,
            transformationMatrix.byteOffset,
            transformationMatrix.byteLength
        );

        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentDescriptor])[0].attachment = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.uniformBindGroup);
        passEncoder.setVertexBuffer(0, this.verticesBuffer);
        passEncoder.draw(cubeVertexCount, 1, 0, 0);
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

    private getTransformationMatrix() {
        const viewMatrix = mat4.create();
        mat4.translate(viewMatrix, viewMatrix, vec3.fromValues(0, 0, -5));
        const now = Date.now() / 1000;
        mat4.rotate(
            viewMatrix,
            viewMatrix,
            1,
            vec3.fromValues(Math.sin(now), Math.cos(now), 0)
        );

        const modelViewProjectionMatrix = mat4.create();
        mat4.multiply(modelViewProjectionMatrix, this.projectionMatrix, viewMatrix);

        return modelViewProjectionMatrix as Float32Array;
    }
}


const wgslShaders = {
    vertex: `
  [[block]] struct Uniforms {
    modelViewProjectionMatrix : mat4x4<f32>;
  };
  
  [[binding(0), group(0)]] var<uniform> uniforms : Uniforms;
  
  struct VertexOutput {
    [[builtin(position)]] Position : vec4<f32>;
    [[location(0)]] fragColor : vec4<f32>;
  };
  
  [[stage(vertex)]]
  fn main([[location(0)]] position : vec4<f32>,
          [[location(1)]] color : vec4<f32>) -> VertexOutput {
    return VertexOutput(uniforms.modelViewProjectionMatrix * position, color);
  }
  `,
    fragment: `
  [[stage(fragment)]]
  fn main([[location(0)]] fragColor : vec4<f32>) -> [[location(0)]] vec4<f32> {
    return fragColor;
  }
  `,
};