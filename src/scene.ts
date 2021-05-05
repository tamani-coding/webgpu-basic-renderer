import { RenderObject } from './objects';
import { device } from './renderer';
import { mat4, vec3 } from 'gl-matrix';

const shadowDepthTextureSize = 1024;

export class Scene {

    private objects: RenderObject[] = [];

    private sceneUniformBuffer: GPUBuffer;
    private sceneBindGroupForRender: GPUBindGroup;
    private bglForRender: GPUBindGroupLayout;
    private shadowPassDescriptor: GPURenderPassDescriptor;

    private lightProjectionMatrix = mat4.create();

    public lightPosition = vec3.fromValues(50, 0, 0);
    private origin = vec3.fromValues(0, 0, 0);
    private upVector = vec3.fromValues(0, 1, 0);
    private lightViewMatrix = mat4.create();
    private lightViewProjMatrix = mat4.create();

    constructor() {

        const left = -80;
        const right = 80;
        const bottom = -80;
        const top = 80;
        const near = -200;
        const far = 300;
        mat4.ortho(this.lightProjectionMatrix, left, right, bottom, top, near, far);

        mat4.lookAt(this.lightViewMatrix, this.lightPosition, this.origin, this.upVector);
        mat4.multiply(this.lightViewProjMatrix, this.lightProjectionMatrix, this.lightViewMatrix);

        this.sceneUniformBuffer = device.createBuffer({
            // Two 4x4 viewProj matrices,
            // one for the camera and one for the light.
            // Then a vec3 for the light position.
            size: 2 * 4 * 16 + 3 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        })

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
    }

    public add(object: RenderObject) {
        this.objects.push(object);
    }

    public getObjects(): RenderObject[] {
        return this.objects;
    }

    public getSceneUniformBuffer(): GPUBuffer {
        return this.sceneUniformBuffer;
    }

    public getLightMatrixData(): Float32Array {
        return this.lightViewProjMatrix as Float32Array;
    }

    public getLightPosition(): Float32Array {
        return this.lightPosition as Float32Array;
    }

    public getShadowPassDescriptor(): GPURenderPassDescriptor {
        return this.shadowPassDescriptor;
    }

    public getSceneBindGroupForRender(): GPUBindGroup {
        return this.sceneBindGroupForRender;
    }
}