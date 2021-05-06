import { device } from './renderer';
import { mat4, vec3 } from 'gl-matrix';
import { triangleVertexArray, triangleVertexCount, cubeVertexArray, cubeVertexCount } from './vertices'

const shadowShaders = {
    vertex: `
    [[block]] struct Scene {
        lightViewProjMatrix : mat4x4<f32>;
        cameraViewProjMatrix : mat4x4<f32>;
        lightPos : vec3<f32>;
      };
      
      [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
      };
      
      [[group(0), binding(0)]] var<uniform> scene : Scene;
      [[group(1), binding(0)]] var<uniform> model : Model;
      
      [[stage(vertex)]]
      fn main([[location(0)]] position : vec3<f32>)
           -> [[builtin(position)]] vec4<f32> {
        return scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
      }
      `,
    fragment: `
        [[stage(fragment)]]
        fn main() {
        }
      `
}

const wgslShaders = {
    vertex: `
    [[block]] struct Scene {
        lightViewProjMatrix : mat4x4<f32>;
        cameraViewProjMatrix : mat4x4<f32>;
        lightPos : vec3<f32>;
      };
      
      [[block]] struct Model {
        modelMatrix : mat4x4<f32>;
      };
      
      [[group(0), binding(0)]] var<uniform> scene : Scene;
      [[group(1), binding(0)]] var<uniform> model : Model;
      
      struct VertexOutput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] fragPos : vec3<f32>;
        [[location(2)]] fragNorm : vec3<f32>;
      
        [[builtin(position)]] Position : vec4<f32>;
      };
      
      [[stage(vertex)]]
      fn main([[location(0)]] position : vec3<f32>,
              [[location(1)]] normal : vec3<f32>) -> VertexOutput {
        var output : VertexOutput;
      
        // XY is in (-1, 1) space, Z is in (0, 1) space
        let posFromLight : vec4<f32> = scene.lightViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
      
        // Convert XY to (0, 1)
        // Y is flipped because texture coords are Y-down.
        output.shadowPos = vec3<f32>(
          posFromLight.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5),
          posFromLight.z
        );
      
        output.Position = scene.cameraViewProjMatrix * model.modelMatrix * vec4<f32>(position, 1.0);
        output.fragPos = output.Position.xyz;
        output.fragNorm = (model.modelMatrix * vec4<f32>(normal, 1.0)).xyz;
        return output;
      }
  `,
    fragment: `
    [[block]] struct Scene {
        lightViewProjMatrix : mat4x4<f32>;
        cameraViewProjMatrix : mat4x4<f32>;
        lightPos : vec3<f32>;
      };
      
      [[group(0), binding(0)]] var<uniform> scene : Scene;
      [[group(0), binding(1)]] var shadowMap: texture_depth_2d;
      [[group(0), binding(2)]] var shadowSampler: sampler_comparison;
      
      struct FragmentInput {
        [[location(0)]] shadowPos : vec3<f32>;
        [[location(1)]] fragPos : vec3<f32>;
        [[location(2)]] fragNorm : vec3<f32>;
      };
      
      let albedo : vec3<f32> = vec3<f32>(0.9, 0.9, 0.9);
      let ambientFactor : f32 = 0.2;
      
      [[stage(fragment)]]
      fn main(input : FragmentInput) -> [[location(0)]] vec4<f32> {
        // Percentage-closer filtering. Sample texels in the region
        // to smooth the result.
        var shadowFactor : f32 = 0.0;
        for (var y : i32 = -1 ; y <= 1 ; y = y + 1) {
            for (var x : i32 = -1 ; x <= 1 ; x = x + 1) {
              let offset : vec2<f32> = vec2<f32>(
                f32(x) * 0.0009765625,
                f32(y) * 0.0009765625);
      
              shadowFactor = shadowFactor + textureSampleCompare(
                shadowMap, shadowSampler,
                input.shadowPos.xy + offset, input.shadowPos.z - 0.007);
            }
        }
      
        shadowFactor = ambientFactor + shadowFactor / 9.0;
      
        let lambertFactor : f32 = dot(normalize(scene.lightPos - input.fragPos), input.fragNorm);
      
        let lightingFactor : f32 = min(shadowFactor * lambertFactor, 1.0);
        return vec4<f32>(lightingFactor * albedo, 1.0);
      }
  `,
};

const positionOffset = 0;
const vertexSize = 4 * 6; // Byte size of one object.
const swapChainFormat = 'bgra8unorm';
const shadowDepthTextureSize = 1024;

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
    private shadowPipeline: GPURenderPipeline;
    private modelUniformBuffer: GPUBuffer;
    private modelUniformBindGroup: GPUBindGroup;
    private sceneBindGroupForShadow: GPUBindGroup;
    private verticesBuffer: GPUBuffer;
    // private indexBuffer: GPUBuffer;
    private vertexCount: number;
    // private indexCount: number;

    private sceneUniformBuffer: GPUBuffer;
    private sceneBindGroupForRender: GPUBindGroup;
    private bglForRender: GPUBindGroupLayout;
    private shadowPassDescriptor: GPURenderPassDescriptor;


    // Create some common descriptors used for both the shadow pipeline
    // and the color rendering pipeline.
    private vertexBuffers: Iterable<GPUVertexBufferLayout> = [
        {
            arrayStride: vertexSize,
            attributes: [
                {
                    // position
                    shaderLocation: 0,
                    offset: positionOffset,
                    format: 'float32x3',
                },
                {
                    // normal
                    shaderLocation: 1,
                    offset: Float32Array.BYTES_PER_ELEMENT * 3,
                    format: 'float32x3',
                },
            ],
        } as GPUVertexBufferLayout,
    ];

    private primitive: GPUPrimitiveState = {
        topology: 'triangle-list',
        cullMode: 'back',
    };

    constructor(device: GPUDevice, verticesArray: Float32Array, vertexCount: number, parameter?: RenderObjectParameter) {
        this.vertexCount = vertexCount;

        this.modelUniformBuffer = device.createBuffer({
            size: this.uniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.verticesBuffer = device.createBuffer({
            size: verticesArray.byteLength,
            usage: GPUBufferUsage.VERTEX,
            mappedAtCreation: true,
        });
        new Float32Array(this.verticesBuffer.getMappedRange()).set(verticesArray);
        this.verticesBuffer.unmap();

        this.sceneUniformBuffer = device.createBuffer({
            // Two 4x4 viewProj matrices,
            // one for the camera and one for the light.
            // Then a vec3 for the light position.
            size: 2 * 4 * 16 + 3 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.shadowPipeline = device.createRenderPipeline({
            vertex: {
                module: device.createShaderModule({
                    code: shadowShaders.vertex,
                }),
                entryPoint: 'main',
                buffers: this.vertexBuffers,
            },
            fragment: {
                // This should be omitted and we can use a vertex-only pipeline, but it's
                // not yet implemented.
                module: device.createShaderModule({
                    code: shadowShaders.fragment,
                }),
                entryPoint: 'main',
                targets: [],
            },
            depthStencil: {
                depthWriteEnabled: true,
                depthCompare: 'less',
                format: 'depth32float',
            },
            primitive: this.primitive,
        });

        this.modelUniformBindGroup = device.createBindGroup({
            layout: this.shadowPipeline.getBindGroupLayout(1),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.modelUniformBuffer,
                        offset: 0,
                        size: this.matrixSize,
                    },
                },
            ],
        });

        // Create a bind group layout which holds the scene uniforms and
        // the texture+sampler for depth. We create it manually because the WebPU
        // implementation doesn't infer this from the shader (yet).
        this.bglForRender = device.createBindGroupLayout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    buffer: {
                        type: 'uniform',
                    },
                } as GPUBindGroupLayoutEntry,
                {
                    binding: 1,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    texture: {
                        sampleType: 'depth',
                    },
                } as GPUBindGroupLayoutEntry,
                {
                    binding: 2,
                    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                    sampler: {
                        type: 'comparison',
                    },
                } as GPUBindGroupLayoutEntry,
            ],
        });

        this.sceneBindGroupForShadow = device.createBindGroup({
            layout: this.shadowPipeline.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.sceneUniformBuffer,
                    },
                },
            ],
        });

        this.renderPipeline = device.createRenderPipeline({
            // Specify the pipeline layout. The layout for the model is the same, so
            // reuse it from the shadow pipeline.
            layout: device.createPipelineLayout({
              bindGroupLayouts: [this.bglForRender, this.shadowPipeline.getBindGroupLayout(1)],
            }),
            vertex: {
              module: device.createShaderModule({
                code: wgslShaders.vertex,
              }),
              entryPoint: 'main',
              buffers: this.vertexBuffers,
            },
            fragment: {
              module: device.createShaderModule({
                code: wgslShaders.fragment,
              }),
              entryPoint: 'main',
              targets: [
                {
                  format: swapChainFormat as GPUTextureFormat,
                },
              ],
            },
            depthStencil: {
              depthWriteEnabled: true,
              depthCompare: 'less',
              format: 'depth24plus-stencil8',
            },
            primitive: this.primitive,
          });

          /////////////////////

        // Create the depth texture for rendering/sampling the shadow map.
        const shadowDepthTexture = device.createTexture({
            size: [shadowDepthTextureSize, shadowDepthTextureSize, 1],
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.SAMPLED,
            format: 'depth32float',
        });
        const shadowDepthTextureView = shadowDepthTexture.createView();
        this.shadowPassDescriptor = {
            colorAttachments: [],
            depthStencilAttachment: {
                view: shadowDepthTextureView,
                depthLoadValue: 1.0,
                depthStoreOp: 'store',
                stencilLoadValue: 0,
                stencilStoreOp: 'store',
            } as GPURenderPassDepthStencilAttachmentNew,
        };

        this.sceneBindGroupForRender = device.createBindGroup({
            layout: this.bglForRender,
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.sceneUniformBuffer,
                    },
                },
                {
                    binding: 1,
                    resource: shadowDepthTextureView,
                },
                {
                    binding: 2,
                    resource: device.createSampler({
                        compare: 'less',
                    }),
                },
            ],
        });

        this.setTransformation(parameter);
    }

    public static cube(parameter?: RenderObjectParameter): RenderObject {
        return new RenderObject(device, cubeVertexArray, cubeVertexCount, parameter)
    }

    public static pyramid(parameter?: RenderObjectParameter): RenderObject {
        return new RenderObject(device, triangleVertexArray, triangleVertexCount, parameter)
    }

    public shadow(shadowPass: GPURenderPassEncoder) {
        this.updateTransformationMatrix();

        shadowPass.setPipeline(this.shadowPipeline);
        device.queue.writeBuffer(
            this.modelUniformBuffer,
            0,
            this.modelViewProjectionMatrix.buffer,
            this.modelViewProjectionMatrix.byteOffset,
            this.modelViewProjectionMatrix.byteLength
        );
        shadowPass.setBindGroup(0, this.sceneBindGroupForShadow);
        shadowPass.setBindGroup(1, this.modelUniformBindGroup);
        shadowPass.setVertexBuffer(0, this.verticesBuffer);
        shadowPass.draw(this.vertexCount, 1, 0, 0);
    }

    public draw(passEncoder: GPURenderPassEncoder, device: GPUDevice) {
        this.updateTransformationMatrix();

        passEncoder.setPipeline(this.renderPipeline);
        device.queue.writeBuffer(
            this.modelUniformBuffer,
            0,
            this.modelViewProjectionMatrix.buffer,
            this.modelViewProjectionMatrix.byteOffset,
            this.modelViewProjectionMatrix.byteLength
        );

        passEncoder.setBindGroup(0, this.sceneBindGroupForRender);
        passEncoder.setBindGroup(1, this.modelUniformBindGroup);
        passEncoder.setVertexBuffer(0, this.verticesBuffer);
        passEncoder.draw(this.vertexCount, 1, 0, 0);
    }

    public getSceneUniformBuffer(): GPUBuffer {
        return this.sceneUniformBuffer;
    }

    public getShadowPassDescriptor(): GPURenderPassDescriptor {
        return this.shadowPassDescriptor;
    }

    private updateTransformationMatrix() {
        // MOVE / TRANSLATE OBJECT
        const modelMatrix = mat4.create();
        mat4.translate(modelMatrix, modelMatrix, vec3.fromValues(this.x, this.y, this.z))
        mat4.rotateX(modelMatrix, modelMatrix, this.rotX);
        mat4.rotateY(modelMatrix, modelMatrix, this.rotY);
        mat4.rotateZ(modelMatrix, modelMatrix, this.rotZ);

        mat4.copy(this.modelViewProjectionMatrix, modelMatrix)
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
