import { device } from './renderer';
import { mat4, vec3 } from 'gl-matrix';
import { triangleVertexArray, triangleVertexCount, cubeVertexArray, cubeVertexCount } from './vertices'

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

const positionOffset = 0;
const colorOffset = 4 * 4; // Byte offset of cube vertex color attribute.
const vertexSize = 4 * 10;

export interface RenderObjectParameter {

    x?: number;
    y?: number;
    z?: number;

    rotX?: number;
    rotY?: number;
    rotZ?: number;
}

export class RenderObject {

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;

    public rotX: number = 0;
    public rotY: number = 0;
    public rotZ: number = 0;

    private matrixSize = 4 * 16; // 4x4 matrix
    private offset = 256; // uniformBindGroup offset must be 256-byte aligned
    private uniformBufferSize = this.offset + this.matrixSize;

    private modelViewProjectionMatrix = mat4.create() as Float32Array;

    private renderPipeline: GPURenderPipeline;
    private uniformBuffer: GPUBuffer;
    private uniformBindGroup: GPUBindGroup;
    private verticesBuffer: GPUBuffer;
    private vertexCount: number;

    constructor(device: GPUDevice, verticesArray: Float32Array, vertexCount: number, parameter?: RenderObjectParameter) {
        this.vertexCount = vertexCount;
        this.renderPipeline = device.createRenderPipeline({
            vertex: {
                module: device.createShaderModule({
                    code: wgslShaders.vertex,
                }),
                entryPoint: 'main',
                buffers: [
                    {
                        arrayStride: vertexSize,
                        attributes: [
                            {
                                // position
                                shaderLocation: 0,
                                offset: positionOffset,
                                format: 'float32x4',
                            },
                            {
                                // color
                                shaderLocation: 1,
                                offset: colorOffset,
                                format: 'float32x4',
                            },
                        ],
                    } as GPUVertexBufferLayout,
                ],
            },
            fragment: {
                module: device.createShaderModule({
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

        this.uniformBuffer = device.createBuffer({
            size: this.uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.uniformBindGroup = device.createBindGroup({
            layout: this.renderPipeline.getBindGroupLayout(0),
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

        this.verticesBuffer = device.createBuffer({
            size: verticesArray.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.verticesBuffer.getMappedRange()).set(verticesArray);
        this.verticesBuffer.unmap();

        this.setTransformation(parameter);
    }

    public static cube(parameter?: RenderObjectParameter): RenderObject {
        return new RenderObject(device, cubeVertexArray, cubeVertexCount, parameter)
    }

    public static pyramid(parameter?: RenderObjectParameter): RenderObject {
        return new RenderObject(device, triangleVertexArray, triangleVertexCount, parameter)
    }

    public draw(passEncoder: GPURenderPassEncoder, device: GPUDevice, viewMatrix: mat4, projectionMatrix: mat4) {
        this.updateTransformationMatrix(viewMatrix, projectionMatrix)

        passEncoder.setPipeline(this.renderPipeline);
        device.queue.writeBuffer(
            this.uniformBuffer,
            0,
            this.modelViewProjectionMatrix.buffer,
            this.modelViewProjectionMatrix.byteOffset,
            this.modelViewProjectionMatrix.byteLength
        );
        passEncoder.setVertexBuffer(0, this.verticesBuffer);
        passEncoder.setBindGroup(0, this.uniformBindGroup);
        passEncoder.draw(this.vertexCount, 1, 0, 0);
    }

    private updateTransformationMatrix(viewMatrix: mat4, projectionMatrix: mat4) {
        // MOVE / TRANSLATE OBJECT
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, vec3.fromValues(this.x, this.y, this.z))
        mat4.rotateX(modelMatrix, modelMatrix, this.rotX);
        mat4.rotateY(modelMatrix, modelMatrix, this.rotY);
        mat4.rotateZ(modelMatrix, modelMatrix, this.rotZ);

        // PROJECT ON CAMERA
        mat4.multiply(this.modelViewProjectionMatrix, viewMatrix, modelMatrix);
        mat4.multiply(
            this.modelViewProjectionMatrix,
            projectionMatrix,
            this.modelViewProjectionMatrix
        );
    }

    private setTransformation(parameter?: RenderObjectParameter) {
        if (parameter == null) {
            return;
        }

        this.x = parameter.x ? parameter.x : 0;
        this.y = parameter.y ? parameter.y : 0;
        this.z = parameter.z ? parameter.z : 0;

        this.rotX = parameter.rotX ? parameter.rotX : 0;
        this.rotY = parameter.rotY ? parameter.rotY : 0;
        this.rotZ = parameter.rotZ ? parameter.rotZ : 0;
    }
}
