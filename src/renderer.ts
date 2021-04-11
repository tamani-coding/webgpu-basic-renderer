const swapChainFormat = 'bgra8unorm';

export async function init(canvas: HTMLCanvasElement) {
    const device = await gpuDevice();

    const pipeline = device.createRenderPipeline({
        vertex: {
            module: device.createShaderModule({
                code: wgslShaders.vertex,
            }),
            entryPoint: 'main',
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
        primitive: {
            topology: "triangle-list"
        },
    });

    const context = canvas.getContext('gpupresent');
    const swapChain = context.configureSwapChain({
        device,
        format: swapChainFormat,
    });

    function frame() {
        const commandEncoder = device.createCommandEncoder();
        const textureView = swapChain.getCurrentTexture().createView();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    attachment: textureView,
                    loadValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
                },
            ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(pipeline);
        passEncoder.draw(3, 1, 0, 0);
        passEncoder.endPass();

        device.queue.submit([commandEncoder.finish()]);
    }

    return frame;
}

async function gpuDevice() {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        console.log('NO WEBGPU FOUND')
        return;
    }
    return await adapter.requestDevice();
}

const wgslShaders = {
    vertex: `
  const pos : array<vec2<f32>, 3> = array<vec2<f32>, 3>(
      vec2<f32>(0.0, 0.5),
      vec2<f32>(-0.5, -0.5),
      vec2<f32>(0.5, -0.5));
  
  [[stage(vertex)]]
  fn main([[builtin(vertex_index)]] VertexIndex : u32)
       -> [[builtin(position)]] vec4<f32> {
    return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  }
  `,
    fragment: `
  [[stage(fragment)]]
  fn main() -> [[location(0)]] vec4<f32> {
    return vec4<f32>(1.0, 0.0, 0.0, 1.0);
  }
  `,
};