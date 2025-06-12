import { getRandomValues, randomInt } from "crypto"

export type PromptParams = {
  prompt: string
  negative_prompt?: string
  width?: number
  height?: number
}

export default (params: PromptParams) => {
  const { prompt, height, negative_prompt, width } = params

  const seed = randomInt(9999999999999)

  return {
    2: {
      inputs: {
        seed: seed,
        steps: 30,
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 1,
        model: ["79", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["6", 0]
      },
      class_type: "KSampler",
      _meta: {
        title: "K采样器"
      }
    },
    3: {
      inputs: {
        text: ["137", 0],
        speak_and_recognation: {
          __value__: [false, true]
        },
        clip: ["35", 0]
      },
      class_type: "CLIPTextEncode",
      _meta: {
        title: "CLIP文本编码"
      }
    },
    4: {
      inputs: {
        text: ["143", 0],
        speak_and_recognation: {
          __value__: [false, true]
        },
        clip: ["35", 0]
      },
      class_type: "CLIPTextEncode",
      _meta: {
        title: "CLIP文本编码"
      }
    },
    6: {
      inputs: {
        width: Math.min(width || 512, 1024),
        height: Math.min(height || 512, 1024),
        batch_size: 1
      },
      class_type: "EmptyLatentImage",
      _meta: {
        title: "空Latent图像"
      }
    },
    8: {
      inputs: {
        ckpt_name: "waiNSFWIllustrious_v140.safetensors"
      },
      class_type: "CheckpointLoaderSimple",
      _meta: {
        title: "Checkpoint加载器（简易）"
      }
    },
    13: {
      inputs: {
        samples: ["2", 0],
        vae: ["8", 2]
      },
      class_type: "VAEDecode",
      _meta: {
        title: "VAE解码"
      }
    },
    23: {
      inputs: {
        model_name: "RealESRGAN_x4plus_anime_6B.pth"
      },
      class_type: "UpscaleModelLoader",
      _meta: {
        title: "加载放大模型"
      }
    },
    24: {
      inputs: {
        upscale_model: ["23", 0],
        image: ["13", 0]
      },
      class_type: "ImageUpscaleWithModel",
      _meta: {
        title: "使用模型放大图像"
      }
    },
    28: {
      inputs: {
        upscale_method: "bilinear",
        scale_by: 0.3500000000000001,
        image: ["24", 0]
      },
      class_type: "ImageScaleBy",
      _meta: {
        title: "缩放图像（比例）"
      }
    },
    30: {
      inputs: {
        pixels: ["28", 0],
        vae: ["8", 2]
      },
      class_type: "VAEEncode",
      _meta: {
        title: "VAE编码"
      }
    },
    31: {
      inputs: {
        seed,
        steps: 25,
        cfg: 7,
        sampler_name: "dpmpp_2m",
        scheduler: "karras",
        denoise: 0.5000000000000001,
        model: ["79", 0],
        positive: ["3", 0],
        negative: ["4", 0],
        latent_image: ["30", 0]
      },
      class_type: "KSampler",
      _meta: {
        title: "K采样器"
      }
    },
    32: {
      inputs: {
        samples: ["31", 0],
        vae: ["8", 2]
      },
      class_type: "VAEDecode",
      _meta: {
        title: "VAE解码"
      }
    },
    35: {
      inputs: {
        stop_at_clip_layer: -2,
        clip: ["79", 1]
      },
      class_type: "CLIPSetLastLayer",
      _meta: {
        title: "设置CLIP最后一层"
      }
    },
    79: {
      inputs: {
        text: "<lora:Smooth_Booster_v3:1> <lora:iLLMythM4gicalL1nes:1> <lora:noobai_ep11_stabilizer_v0:1> <lora:NOOB_vp1_detailer_by_volnovik_v1:1>",
        speak_and_recognation: {
          __value__: [false, true]
        },
        loras: {
          __value__: [
            {
              name: "Smooth_Booster_v3",
              strength: "0.65",
              active: true,
              clipStrength: "0.65",
              expanded: false
            },
            {
              name: "iLLMythM4gicalL1nes",
              strength: "0.60",
              active: true,
              clipStrength: "0.60",
              expanded: false
            },
            {
              name: "noobai_ep11_stabilizer_v0",
              strength: "0.50",
              active: true,
              clipStrength: "0.50",
              expanded: false
            },
            {
              name: "NOOB_vp1_detailer_by_volnovik_v1",
              strength: "0.60",
              active: true,
              clipStrength: "0.60",
              expanded: false
            }
          ]
        },
        model: ["8", 0],
        clip: ["8", 1]
      },
      class_type: "Lora Loader (LoraManager)",
      _meta: {
        title: "Lora Loader (LoraManager)"
      }
    },
    118: {
      inputs: {
        embedding: "SmoothNegative_Hands-neg.safetensors",
        emphasis: 1,
        append: true,
        text: "",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "EmbeddingPicker",
      _meta: {
        title: "Embedding Picker"
      }
    },
    125: {
      inputs: {
        embedding: "Smooth_Negative-neg.safetensors",
        emphasis: 1,
        append: true,
        text: "",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "EmbeddingPicker",
      _meta: {
        title: "Embedding Picker"
      }
    },
    126: {
      inputs: {
        embedding: "ng_deepnegative_v1_75t.pt",
        emphasis: 1,
        append: true,
        text: "",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "EmbeddingPicker",
      _meta: {
        title: "Embedding Picker"
      }
    },
    137: {
      inputs: {
        part1:
          "(masterpiece:1.2), best quality, highres,extremely detailed CG,perfect lighting,8k wallpaper",
        part2: ["138", 0],
        part3: ["79", 2],
        part4: prompt,
        separator: ",",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "CR Combine Prompt",
      _meta: {
        title: "⚙️ CR Combine Prompt"
      }
    },
    138: {
      inputs: {
        embedding: "Smooth_Quality.safetensors",
        emphasis: 1,
        append: true,
        text: "",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "EmbeddingPicker",
      _meta: {
        title: "Embedding Picker"
      }
    },
    143: {
      inputs: {
        part1: negative_prompt,
        part2: ["118", 0],
        part3: ["125", 0],
        part4: ["126", 0],
        separator: ",",
        speak_and_recognation: {
          __value__: [false, true]
        }
      },
      class_type: "CR Combine Prompt",
      _meta: {
        title: "⚙️ CR Combine Prompt"
      }
    },
    144: {
      inputs: {
        filename_prefix: "ComfyUI_Export",
        images: ["32", 0]
      },
      class_type: "SaveImage",
      _meta: {
        title: "保存图像"
      }
    }
  }
}
