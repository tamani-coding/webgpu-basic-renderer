import { mat4, vec3 } from 'gl-matrix';
import { triangleVertexArray, triangleVertexSize, trianglePositionOffset, triangleColorOffset, triangleVertexCount } from './vertices'
import { cubeVertexArray, cubeVertexCount } from './vertices'

export class WebGpuRenderer {

    readonly swapChainFormat = 'bgra8unorm';
    // readonly uniformBufferSize = 4 * 16; // 4x4 matrix

    private initSuccess: boolean = false;
    private zoomDelta: number = -5;

    private device: GPUDevice;
    private swapChain: GPUSwapChain;
    private uniformBuffer: GPUBuffer;
    private renderPassDescriptor: GPURenderPassDescriptor;
    private pipeline: GPURenderPipeline;

    private uniformBindGroup1: GPUBindGroup;
    private uniformBindGroup2: GPUBindGroup;

    private matrixSize = 4 * 16; // 4x4 matrix
    private offset = 256; // uniformBindGroup offset must be 256-byte aligned
    private uniformBufferSize = this.offset + this.matrixSize;

    private verticesBuffer: GPUBuffer[] = [];

    private projectionMatrix = mat4.create();
    private viewMatrix = mat4.create();

    private modelMatrix1 = mat4.create();
    private modelMatrix2 = mat4.create();

    private modelViewProjectionMatrix1 = mat4.create() as Float32Array;
    private modelViewProjectionMatrix2 = mat4.create() as Float32Array;

    private tmpMat41 = mat4.create();
    private tmpMat42 = mat4.create();


    constructor() {
        mat4.translate(this.viewMatrix, this.viewMatrix, vec3.fromValues(0, 0, -5));

        mat4.translate(this.modelMatrix1, this.modelMatrix1, vec3.fromValues(-2, 0, 0));
        mat4.translate(this.modelMatrix2, this.modelMatrix2, vec3.fromValues(2, 0, 0));
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

        this.addVertexBuffer(triangleVertexArray)
        this.addVertexBuffer(cubeVertexArray)

        this.pipeline = this.device.createRenderPipeline({
            vertex: {
                module: this.device.createShaderModule({
                    code: wgslShaders.vertex,
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: triangleVertexSize,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: trianglePositionOffset,
                                format: 'float32x4',
                            },
                            {
                                // color
                                shaderLocation: 1,
                                offset: triangleColorOffset,
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

        this.uniformBindGroup1 = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                        offset: 0,
                        size: this.matrixSize,
                    },
                },
            ],
        });
        this.uniformBindGroup2 = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.uniformBuffer,
                        offset: this.offset,
                        size: this.matrixSize,
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

        this.getTransformationMatrix();


        (this.renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachmentDescriptor])[0].attachment = this.swapChain
            .getCurrentTexture()
            .createView();

        const commandEncoder = this.device.createCommandEncoder();
        const passEncoder = commandEncoder.beginRenderPass(this.renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);

        // for (let i = 0; i < this.verticesBuffer.length; i++) {
        //     passEncoder.setVertexBuffer(i, this.verticesBuffer[i]);
        // }
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            this.modelViewProjectionMatrix1.buffer,
            this.modelViewProjectionMatrix1.byteOffset,
            this.modelViewProjectionMatrix1.byteLength
        );
        passEncoder.setVertexBuffer(0, this.verticesBuffer[0]);
        passEncoder.setBindGroup(0, this.uniformBindGroup1);
        passEncoder.draw(triangleVertexCount, 1, 0, 0);
        
        this.device.queue.writeBuffer(
            this.uniformBuffer,
            this.offset,
            this.modelViewProjectionMatrix2.buffer,
            this.modelViewProjectionMatrix2.byteOffset,
            this.modelViewProjectionMatrix2.byteLength
        );
        passEncoder.setVertexBuffer(0, this.verticesBuffer[1]);
        passEncoder.setBindGroup(0, this.uniformBindGroup2);
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
        const now = Date.now() / 1000;

        mat4.rotate(
            this.tmpMat41,
            this.modelMatrix1,
            1,
            vec3.fromValues(Math.sin(now), Math.cos(now), 0)
        );
        mat4.rotate(
            this.tmpMat42,
            this.modelMatrix2,
            1,
            vec3.fromValues(Math.cos(now), Math.sin(now), 0)
        );

        mat4.multiply(this.modelViewProjectionMatrix1, this.viewMatrix, this.tmpMat41);
        mat4.multiply(
            this.modelViewProjectionMatrix1,
            this.projectionMatrix,
            this.modelViewProjectionMatrix1
        );
        mat4.multiply(this.modelViewProjectionMatrix2, this.viewMatrix, this.tmpMat42);
        mat4.multiply(
            this.modelViewProjectionMatrix2,
            this.projectionMatrix,
            this.modelViewProjectionMatrix2
        );
    }

    private addVertexBuffer(array: Float32Array): GPUBuffer {
        const buffer = this.device.createBuffer({
            size: array.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(buffer.getMappedRange()).set(array);
        buffer.unmap();

        this.verticesBuffer.push(buffer)

        return buffer;
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