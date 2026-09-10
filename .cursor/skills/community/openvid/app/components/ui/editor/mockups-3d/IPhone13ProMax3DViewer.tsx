"use client";

import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, useGLTF, Environment, OrbitControls } from "@react-three/drei";
import { useEffect, useRef, useState, Suspense, useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { createCoverScreenCanvas, applyCropToImage, type ImageMaskConfigLike, applyTextureCover } from "@/lib/phone3d.utils";
import type { OrbitControls as OrbitControlsType } from 'three-stdlib';
import { EnvironmentPreset, HDRI_FILES, sphericalCameraPos } from "@/lib/viewer-controls3d";
import { GetMediaMaskStyles } from "@/lib/media-mask.utils";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export interface IPhone13ProMax3DApi {
  renderAt: (width: number, height: number) => void;
  restorePreview: () => void;
  hasBuiltInShadow: boolean;
  getVisualSize: () => { width: number; height: number } | null;
}

interface Props {
  imageUrl?: string | null;
  imageMaskConfig?: ImageMaskConfigLike | null;
  cropArea?: { x: number; y: number; width: number; height: number } | null;
  initialRotationX?: number;
  initialRotationY?: number;
  initialRotationZ?: number;
  onRotationChange?: (rx: number, ry: number) => void;
  onMount?: (canvas: HTMLCanvasElement) => void;
  onApi?: (api: IPhone13ProMax3DApi | null) => void;
  scale?: number;
  zoom?: number;
  shadowIntensity?: number;
  shadowColor?: string;
  videoElement?: HTMLVideoElement | null;
  autoRotate?: boolean;
  rotationSpeed?: number;
  glow?: number;
  environment?: EnvironmentPreset;
  isSelected?: boolean;
  isHovered?: boolean;
  onHoverChange?: (isHovered: boolean) => void;
  onSelectChange?: (isSelected: boolean) => void;
}

const TEX_W = 1284;
const TEX_H = 2778;
const PLACEHOLDER_PHONE_URL = "/images/mockups-3d/placeholder-phone.avif";
const DRACO_URL = "/draco/";

useGLTF.preload("/models/apple_iphone_13_pro_max.glb", DRACO_URL);

interface GLTFNodes {
  Frame_Frame_0: THREE.Mesh;
  Frame_Frame2_0: THREE.Mesh;
  Frame_Port_0: THREE.Mesh;
  Frame_Antenna_0: THREE.Mesh;
  Frame_Mic_0: THREE.Mesh;
  Body_Mic_0: THREE.Mesh;
  Body_Bezel_0: THREE.Mesh;
  Body_Body_0: THREE.Mesh;
  Body_Wallpaper_0: THREE.Mesh;
  Body_Camera_Glass_0: THREE.Mesh;
  Body_Lens_0: THREE.Mesh;
  Body_Material_0: THREE.Mesh;
  Camera_Body_0: THREE.Mesh;
  Camera_Glass_0: THREE.Mesh;
  Camera_Camera_Frame001_0: THREE.Mesh;
  Camera_Mic_0: THREE.Mesh;
  Body001_Screen_Glass_0: THREE.Mesh;
  Button_Frame_0: THREE.Mesh;
  Circle003_Frame_0: THREE.Mesh;
  Apple_Logo_Logo_0: THREE.Mesh;
  Camera001_Body_0: THREE.Mesh;
  Camera001_Gray_Glass_0: THREE.Mesh;
  Camera001_Flash_0: THREE.Mesh;
  Camera001_Port_0: THREE.Mesh;
  Camera001_Camera_Frame_0: THREE.Mesh;
  Camera001_Camera_Glass_0: THREE.Mesh;
  Camera001_Lens_0: THREE.Mesh;
  Camera001_Black_Glass_0: THREE.Mesh;
  Camera003_Material002_0: THREE.Mesh;
}

interface GLTFMaterials {
  Frame: THREE.Material;
  Frame2: THREE.Material;
  Port: THREE.Material;
  Antenna: THREE.Material;
  material: THREE.Material;
  Bezel: THREE.Material;
  Body: THREE.Material;
  Wallpaper: THREE.Material;
  Camera_Glass: THREE.Material;
  Lens: THREE.Material;
  Material: THREE.Material;
  Glass: THREE.Material;
  "Camera_Frame.001": THREE.Material;
  Screen_Glass: THREE.Material;
  Logo: THREE.Material;
  Gray_Glass: THREE.Material;
  Flash: THREE.Material;
  Camera_Frame: THREE.Material;
  Black_Glass: THREE.Material;
  "Material.002": THREE.Material;
}

export function IPhone13ProMaxScene({
  imageUrl = null,
  imageMaskConfig = null,
  cropArea = null,
  initialRotationX = -58.23,
  initialRotationY = -29.82,
  initialRotationZ = 0,
  onRotationChange,
  rootRef,
  cameraRef,
  zoom = 1,
  onApi,
  onLoaded,
  videoElement,
  shadowIntensity = 0,
  shadowColor = "#000000",
  autoRotate = false,
  rotationSpeed = 3.5,
  glow = 2.0,
  environment = "sunset",
  isSelected = false,
  isHovered = false,
}: {
  imageUrl?: string | null;
  imageMaskConfig?: ImageMaskConfigLike | null;
  cropArea?: { x: number; y: number; width: number; height: number } | null;
  initialRotationX?: number;
  initialRotationY?: number;
  initialRotationZ?: number;
  onRotationChange?: (rx: number, ry: number) => void;
  rootRef: React.MutableRefObject<THREE.Group | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  zoom?: number;
  onApi?: (api: IPhone13ProMax3DApi | null) => void;
  onLoaded?: () => void;
  videoElement?: HTMLVideoElement | null;
  shadowIntensity?: number;
  shadowColor?: string;
  autoRotate?: boolean;
  rotationSpeed?: number;
  glow?: number;
  environment?: EnvironmentPreset;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const { gl, scene, camera, invalidate, size } = useThree();

  const gltf = useGLTF("/models/apple_iphone_13_pro_max.glb", DRACO_URL) as unknown as {
    nodes: GLTFNodes;
    materials: GLTFMaterials;
  };
  const { nodes, materials } = gltf;
  const orbitRef = useRef<OrbitControlsType | null>(null);
  const lastLoadedImageUrlRef = useRef<string | null>(null);
  const lastLoadedMaskKeyRef = useRef<string | null>(null);
  const lastLoadedCropKeyRef = useRef<string | null>(null);
  const wallpaperMatRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
  const onApiRef = useRef(onApi);
  const composerRef = useRef<EffectComposer | null>(null);
  const outlinePassRef = useRef<OutlinePass | null>(null);
  const invalidateRef = useRef(invalidate);
  useEffect(() => {
    invalidateRef.current = invalidate;
  }, []);
  useLayoutEffect(() => {
    onApiRef.current = onApi;
  });

  useFrame(() => {
    if (videoElement && videoTextureRef.current) {
      videoTextureRef.current.needsUpdate = true;
    }
  });

  useEffect(() => {
    const capturedOnApi = onApiRef.current;
    const RENDER_PIXEL_RATIO = 2;
    const api: IPhone13ProMax3DApi = {
      renderAt: (w, h) => {
        const cam = cameraRef.current ?? camera;
        if (!cam) return;
        const maxTexSize = gl.capabilities.maxTextureSize || 4096;
        const maxDim = Math.floor(maxTexSize / RENDER_PIXEL_RATIO) - 1;
        const safeW = Math.max(1, Math.min(Math.round(w), maxDim));
        const safeH = Math.max(1, Math.min(Math.round(h), maxDim));
        (cam as THREE.PerspectiveCamera).aspect = safeW / safeH;
        (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
        gl.setPixelRatio(RENDER_PIXEL_RATIO);
        gl.setSize(safeW, safeH, false);
        if (videoTextureRef.current) videoTextureRef.current.needsUpdate = true;
        gl.render(scene, cam);
      },
      restorePreview: () => {
        const cam = cameraRef.current ?? camera;
        if (!cam) return;
        const freshW = gl.domElement.clientWidth;
        const freshH = gl.domElement.clientHeight;
        (cam as THREE.PerspectiveCamera).aspect = freshW / freshH;
        (cam as THREE.PerspectiveCamera).updateProjectionMatrix();
        gl.setPixelRatio(window.devicePixelRatio > 2 ? 3 : 2);
        gl.setSize(freshW, freshH, false);
        composerRef.current?.setSize(freshW, freshH);
        composerRef.current?.setPixelRatio(gl.getPixelRatio());
        outlinePassRef.current?.resolution.set(freshW, freshH);
        invalidateRef.current();
      },
      getVisualSize: () => {
        const canvas = gl.domElement;
        const domW = canvas.clientWidth;
        const domH = canvas.clientHeight;
        if (!domW || !domH) return null;
        return { width: domW, height: domH };
      },
      hasBuiltInShadow: true,
    };
    capturedOnApi?.(api);
    return () => capturedOnApi?.(null);
  }, [gl, scene, camera, cameraRef]);

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  useEffect(() => {
    if (materials.Wallpaper) {
      wallpaperMatRef.current = materials.Wallpaper as THREE.MeshStandardMaterial;
    }
  }, [materials.Wallpaper]);

  useEffect(() => {
    if (!videoElement) {
      if (videoTextureRef.current) {
        videoTextureRef.current.dispose();
        videoTextureRef.current = null;
      }
      return;
    }
    const tex = new THREE.VideoTexture(videoElement);
    tex.flipY = true;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;

    const updateTextureTransform = () => {
      applyTextureCover(
        tex,
        videoElement.videoWidth,
        videoElement.videoHeight,
        TEX_W,
        TEX_H,
        cropArea
      );
    };

    if (videoElement.readyState >= 1) {
      updateTextureTransform();
    } else {
      videoElement.addEventListener("loadedmetadata", updateTextureTransform);
    }

    if (videoTextureRef.current) {
      videoTextureRef.current.dispose();
    }
    videoTextureRef.current = tex;

    const applyVideoTex = () => {
      const mat = wallpaperMatRef.current;
      if (!mat) return;
      if (mat.map && mat.map !== tex) {
        mat.map.dispose();
      }
      mat.map = tex;
      mat.color.set(0xffffff);
      mat.needsUpdate = true;
    };
    applyVideoTex();

    return () => {
      videoElement.removeEventListener("loadedmetadata", updateTextureTransform);
      if (videoTextureRef.current === tex) {
        videoTextureRef.current = null;
      }
      tex.dispose();
    };
  }, [videoElement,cropArea]);

  useEffect(() => {
    const mat = wallpaperMatRef.current;
    if (!mat) return;
    if (videoElement) return;

    const maskKey = imageMaskConfig ? JSON.stringify(imageMaskConfig) : null;
    const cropKey = cropArea ? JSON.stringify(cropArea) : null;

    if (!imageUrl) {
      const placeholderKey = `__placeholder__:${PLACEHOLDER_PHONE_URL}`;
      if (lastLoadedImageUrlRef.current === placeholderKey) return;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const sourceImage = cropArea ? applyCropToImage(img, cropArea) : img;
        const cover = createCoverScreenCanvas(sourceImage, TEX_W, TEX_H, 0, null);
        if (mat.map) {
          mat.map.dispose();
          mat.map = null;
        }
        const tex = new THREE.CanvasTexture(cover);
        tex.flipY = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = gl.capabilities.getMaxAnisotropy();
        mat.map = tex;
        mat.needsUpdate = true;
        lastLoadedImageUrlRef.current = placeholderKey;
        lastLoadedMaskKeyRef.current = null;
        lastLoadedCropKeyRef.current = null;
      };
      img.onerror = () => {
        if (mat.map) {
          mat.map.dispose();
          mat.map = null;
        }
        mat.color.set(0x1a1a1a);
        mat.needsUpdate = true;
        lastLoadedImageUrlRef.current = placeholderKey;
      };
      img.src = PLACEHOLDER_PHONE_URL;
      return;
    }

    if (
      lastLoadedImageUrlRef.current === imageUrl &&
      lastLoadedMaskKeyRef.current === maskKey &&
      lastLoadedCropKeyRef.current === cropKey
    )
      return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const sourceImage = cropArea ? applyCropToImage(img, cropArea) : img;
      const cover = createCoverScreenCanvas(sourceImage, TEX_W, TEX_H, 0, imageMaskConfig);
      if (mat.map) {
        mat.map.dispose();
        mat.map = null;
      }
      const tex = new THREE.CanvasTexture(cover);
      tex.flipY = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.anisotropy = gl.capabilities.getMaxAnisotropy();
      mat.map = tex;
      mat.needsUpdate = true;
      invalidateRef.current();
      lastLoadedImageUrlRef.current = imageUrl;
      lastLoadedMaskKeyRef.current = maskKey;
      lastLoadedCropKeyRef.current = cropKey;
    };
    img.src = imageUrl;
  }, [imageUrl, imageMaskConfig, cropArea, gl, videoElement]);

  useEffect(() => {
    return () => {
      if (wallpaperMatRef.current && wallpaperMatRef.current.map) {
        wallpaperMatRef.current.map.dispose();
      }
    };
  }, []);

  const prevRotationRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (
      prevRotationRef.current?.x === initialRotationX &&
      prevRotationRef.current?.y === initialRotationY
    )
      return;
    const id = setTimeout(() => {
      const orbit = orbitRef.current;
      if (!orbit) return;
      const DEG = Math.PI / 180;
      const radius = 1.5;
      const phi = Math.PI / 2 - initialRotationX * DEG;
      const theta = initialRotationY * DEG;
      orbit.object.position.setFromSphericalCoords(radius, phi, theta);
      orbit.update();
      invalidateRef.current();
      prevRotationRef.current = { x: initialRotationX, y: initialRotationY };
    }, 0);
    return () => clearTimeout(id);
  }, [initialRotationX, initialRotationY, zoom]);

  useEffect(() => {
    const root = rootRef.current;
    if (root) {
      root.rotation.z = initialRotationZ * (Math.PI / 180);
      invalidateRef.current();
    }
  }, [initialRotationZ]);

  const shadowT = Math.max(0, Math.min(1, shadowIntensity));
  const showContactShadow = shadowT > 0.01;

  const customShadowTexture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 512, 512);
      const w = 150;
      const h = 300;
      const y = 256 - h / 2;
      const r = 32;

      const drawShape = (context: CanvasRenderingContext2D, currentWidth: number) => {
        context.beginPath();
        const currentX = 256 - currentWidth / 2;
        context.moveTo(currentX + r, y);
        context.lineTo(currentX + currentWidth - r, y);
        context.quadraticCurveTo(currentX + currentWidth, y, currentX + currentWidth, y + r);
        context.lineTo(currentX + currentWidth, y + h - r);
        context.quadraticCurveTo(currentX + currentWidth, y + h, currentX + currentWidth - r, y + h);
        context.lineTo(currentX + r, y + h);
        context.quadraticCurveTo(currentX, y + h, currentX, y + h - r);
        context.lineTo(currentX, y + r);
        context.quadraticCurveTo(currentX, y, currentX + r, y);
        context.closePath();
      };

      const canvasBlur = document.createElement("canvas");
      canvasBlur.width = 512;
      canvasBlur.height = 512;
      const ctxBlur = canvasBlur.getContext("2d");

      const canvasSharp = document.createElement("canvas");
      canvasSharp.width = 512;
      canvasSharp.height = 512;
      const ctxSharp = canvasSharp.getContext("2d");

      if (ctxBlur && ctxSharp) {
        ctxBlur.filter = "blur(10px)";
        ctxBlur.shadowColor = "white";
        ctxBlur.shadowBlur = 10;
        ctxBlur.fillStyle = "white";
        drawShape(ctxBlur, 110);
        ctxBlur.fill();
        ctxBlur.globalCompositeOperation = "destination-in";
        const gradientTop = ctxBlur.createLinearGradient(0, y, 0, y + h);
        gradientTop.addColorStop(0, "rgba(255, 255, 255, 1.0)");
        gradientTop.addColorStop(0.5, "rgba(255, 255, 255, 0.3)");
        gradientTop.addColorStop(1, "rgba(255, 255, 255, 0.0)");
        ctxBlur.fillStyle = gradientTop;
        ctxBlur.fillRect(0, 0, 512, 512);

        ctxSharp.shadowColor = "white";
        ctxSharp.shadowBlur = 10;
        ctxSharp.fillStyle = "white";
        drawShape(ctxSharp, w);
        ctxSharp.fill();
        ctxSharp.shadowBlur = 0;
        drawShape(ctxSharp, w);
        ctxSharp.fill();
        ctxSharp.globalCompositeOperation = "destination-in";
        const gradientBottom = ctxSharp.createLinearGradient(0, y, 0, y + h);
        gradientBottom.addColorStop(0, "rgba(255, 255, 255, 0.0)");
        gradientBottom.addColorStop(0.4, "rgba(255, 255, 255, 0.5)");
        gradientBottom.addColorStop(1, "rgba(255, 255, 255, 1.0)");
        ctxSharp.fillStyle = gradientBottom;
        ctxSharp.fillRect(0, 0, 512, 512);

        ctx.drawImage(canvasBlur, 0, 0);
        ctx.drawImage(canvasSharp, 0, 0);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);
  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const outlinePass = new OutlinePass(
      new THREE.Vector2(size.width, size.height),
      scene,
      camera
    );
    outlinePass.edgeStrength = 6;
    outlinePass.edgeGlow = 0;
    outlinePass.edgeThickness = 1.5;
    outlinePass.pulsePeriod = 0;
    outlinePass.visibleEdgeColor.set(0xffffff);
    outlinePass.hiddenEdgeColor.set(0xffffff);
    composer.addPass(outlinePass);
    composer.addPass(new OutputPass());

    composerRef.current = composer;
    outlinePassRef.current = outlinePass;
    invalidateRef.current();

    return () => {
      outlinePass.dispose();
      composer.dispose();
      composerRef.current = null;
      outlinePassRef.current = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height);
    composerRef.current?.setPixelRatio(gl.getPixelRatio());
    outlinePassRef.current?.resolution.set(size.width, size.height);
    invalidateRef.current();
  }, [size, gl]);

  useEffect(() => {
    const outlinePass = outlinePassRef.current;
    if (!outlinePass) return;
    const showOutline = isSelected || isHovered;
    outlinePass.selectedObjects = showOutline && rootRef.current ? [rootRef.current] : [];
    const color = isSelected ? 0x3b82f6 : 0xffffff;
    outlinePass.visibleEdgeColor.set(color);
    outlinePass.hiddenEdgeColor.set(color);
    invalidateRef.current();
  }, [isSelected, isHovered]);

  useFrame(() => {
    composerRef.current?.render();
  }, 1);
  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault fov={40} near={0.01} far={100} position={sphericalCameraPos(initialRotationX, initialRotationY)} zoom={zoom} />
      <Environment files={HDRI_FILES[environment as EnvironmentPreset]} environmentIntensity={glow} background={false} />
      <OrbitControls
        ref={orbitRef}
        enableZoom={false}
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        autoRotate={autoRotate}
        autoRotateSpeed={rotationSpeed}
        onEnd={() => {
          const orbit = orbitRef.current;
          if (!orbit || !onRotationChange) return;
          const ry = orbit.getAzimuthalAngle() * (180 / Math.PI);
          const rx = (Math.PI / 2 - orbit.getPolarAngle()) * (180 / Math.PI);
          onRotationChange(rx, ry);
        }}
      />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 6, 5]} intensity={0.6} />
      <directionalLight position={[-4, -2, 3]} intensity={0.25} color="#c8d8ff" />
      <directionalLight position={[0, -5, 5]} intensity={0.35} />

      {showContactShadow && (
        <mesh position={[-0.0, -0.203, -0.156]} rotation={[-Math.PI / 2, 0, 0.1]} scale={[0.55, 0.55, 1.5]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial color={shadowColor} transparent opacity={shadowT * 0.7} alphaMap={customShadowTexture} depthWrite={false} />
        </mesh>
      )}

      <group ref={rootRef} rotation={[0, Math.PI, 0]} scale={0.004} dispose={null}>
        <group scale={100}>
          <mesh receiveShadow geometry={nodes.Frame_Frame_0.geometry} material={materials.Frame} />
          <mesh receiveShadow geometry={nodes.Frame_Frame2_0.geometry} material={materials.Frame2} />
          <mesh receiveShadow geometry={nodes.Frame_Port_0.geometry} material={materials.Port} />
          <mesh receiveShadow geometry={nodes.Frame_Antenna_0.geometry} material={materials.Antenna} />
          <mesh receiveShadow geometry={nodes.Frame_Mic_0.geometry} material={materials.material} />
          <mesh receiveShadow geometry={nodes.Body_Mic_0.geometry} material={materials.material} />
          <mesh receiveShadow geometry={nodes.Body_Bezel_0.geometry} material={materials.Bezel} />
          <mesh receiveShadow geometry={nodes.Body_Body_0.geometry} material={materials.Body} />
          <mesh receiveShadow geometry={nodes.Body_Wallpaper_0.geometry} material={materials.Wallpaper} />
          <mesh receiveShadow geometry={nodes.Body_Camera_Glass_0.geometry} material={materials.Camera_Glass} />
          <mesh receiveShadow geometry={nodes.Body_Lens_0.geometry} material={materials.Lens} />
          <mesh receiveShadow geometry={nodes.Body_Material_0.geometry} material={materials.Material} />
          <mesh receiveShadow geometry={nodes.Camera_Body_0.geometry} material={materials.Body} />
          <mesh receiveShadow geometry={nodes.Camera_Glass_0.geometry} material={materials.Glass} />
          <mesh
            receiveShadow
            geometry={nodes.Camera_Camera_Frame001_0.geometry}
            material={materials["Camera_Frame.001"]}
          />
          <mesh receiveShadow geometry={nodes.Camera_Mic_0.geometry} material={materials.material} />
          <mesh receiveShadow geometry={nodes.Body001_Screen_Glass_0.geometry} material={materials.Screen_Glass} />
          <mesh receiveShadow geometry={nodes.Button_Frame_0.geometry} material={materials.Frame} />
          <mesh receiveShadow geometry={nodes.Circle003_Frame_0.geometry} material={materials.Frame} />
          <mesh receiveShadow geometry={nodes.Apple_Logo_Logo_0.geometry} material={materials.Logo} />
          <mesh receiveShadow geometry={nodes.Camera001_Body_0.geometry} material={materials.Body} />
          <mesh receiveShadow geometry={nodes.Camera001_Gray_Glass_0.geometry} material={materials.Gray_Glass} />
          <mesh receiveShadow geometry={nodes.Camera001_Flash_0.geometry} material={materials.Flash} />
          <mesh receiveShadow geometry={nodes.Camera001_Port_0.geometry} material={materials.Port} />
          <mesh
            receiveShadow
            geometry={nodes.Camera001_Camera_Frame_0.geometry}
            material={materials.Camera_Frame}
          />
          <mesh receiveShadow geometry={nodes.Camera001_Camera_Glass_0.geometry} material={materials.Camera_Glass} />
          <mesh receiveShadow geometry={nodes.Camera001_Lens_0.geometry} material={materials.Lens} />
          <mesh receiveShadow geometry={nodes.Camera001_Black_Glass_0.geometry} material={materials.Black_Glass} />
          <mesh receiveShadow geometry={nodes.Camera003_Material002_0.geometry} material={materials["Material.002"]} />
        </group>
      </group>
    </>
  );
}

function CanvasWithLoader({
  imageUrl,
  imageMaskConfig,
  cropArea,
  initialRotationX,
  initialRotationY,
  initialRotationZ,
  onRotationChange,
  rootRef,
  cameraRef,
  zoom,
  onApi,
  onMount,
  videoElement,
  shadowIntensity,
  shadowColor,
  autoRotate,
  rotationSpeed,
  glow,
  environment,
  isSelected,
  isHovered,
}: {
  imageUrl: string | null;
  imageMaskConfig: ImageMaskConfigLike | null;
  cropArea: { x: number; y: number; width: number; height: number } | null;
  initialRotationX: number;
  initialRotationY: number;
  initialRotationZ: number;
  onRotationChange?: (rx: number, ry: number) => void;
  rootRef: React.MutableRefObject<THREE.Group | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  zoom: number;
  onApi?: (api: IPhone13ProMax3DApi | null) => void;
  onMount?: (canvas: HTMLCanvasElement) => void;
  videoElement?: HTMLVideoElement | null;
  shadowIntensity?: number;
  shadowColor?: string;
  autoRotate?: boolean;
  rotationSpeed?: number;
  glow?: number;
  environment?: EnvironmentPreset;
  isSelected?: boolean;
  isHovered?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <Canvas
        shadows="soft"
        style={{ width: "100%", height: "100%", overflow: "visible" }}
        gl={{
          antialias: true,
          alpha: true,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
          failIfMajorPerformanceCaveat: false,
        }}
        dpr={3}
        frameloop={videoElement ? "always" : "demand"}
        resize={{ scroll: false, debounce: { scroll: 0, resize: 0 } }}
        onCreated={({ gl, scene }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1.0;
          scene.environmentIntensity = 1.6;
          onMount?.(gl.domElement);
        }}
      >
        <Suspense fallback={null}>
          <IPhone13ProMaxScene
            imageUrl={imageUrl}
            imageMaskConfig={imageMaskConfig}
            cropArea={cropArea}
            initialRotationX={initialRotationX}
            initialRotationY={initialRotationY}
            initialRotationZ={initialRotationZ}
            onRotationChange={onRotationChange}
            rootRef={rootRef}
            cameraRef={cameraRef}
            zoom={zoom}
            onApi={onApi}
            onLoaded={() => setLoaded(true)}
            videoElement={videoElement}
            shadowIntensity={shadowIntensity}
            shadowColor={shadowColor}
            autoRotate={autoRotate}
            rotationSpeed={rotationSpeed}
            glow={glow}
            environment={environment}
            isSelected={isSelected}
            isHovered={isHovered}
          />
        </Suspense>
      </Canvas>
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ zIndex: 4 }}
        >
          <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}

export function IPhone13ProMax3DViewer({
  imageUrl = null,
  imageMaskConfig = null,
  cropArea = null,
  initialRotationX = -58.23,
  initialRotationY = -29.82,
  initialRotationZ = 0,
  onRotationChange,
  onMount,
  onApi,
  zoom = 1,
  shadowIntensity = 0,
  shadowColor = "#000000",
  videoElement = null,
  autoRotate,
  rotationSpeed,
  glow,
  environment,
  isSelected = false,
  isHovered = false,
  onHoverChange,
  onSelectChange,
}: Props) {
  const rootRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const [modelHovered, setModelHovered] = useState(false);

  const t = Math.max(0, Math.min(1, shadowIntensity));
  const tEased = t * t;
  const computedBlur = tEased * 60;
  const hasShadow = t > 0.01;

  const maskStyle = GetMediaMaskStyles(imageMaskConfig, {
    inset: 400,
    deviceWidth: 480,
    deviceHeight: 1000,
  });

  const hitsModel = (clientX: number, clientY: number): boolean => {
    const canvas = canvasElRef.current;
    const cam = cameraRef.current;
    const model = rootRef.current;
    if (!canvas || !cam || !model) return false;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycasterRef.current.setFromCamera(new THREE.Vector2(x, y), cam);
    return raycasterRef.current.intersectObject(model, true).length > 0;
  };

  const handleCanvasMount = (canvas: HTMLCanvasElement) => {
    canvasElRef.current = canvas;
    onMount?.(canvas);
  };

  useEffect(() => {
    const onWinPointerUp = () => setGrabbing(false);
    window.addEventListener("pointerup", onWinPointerUp);
    return () => window.removeEventListener("pointerup", onWinPointerUp);
  }, []);

  return (
    <>
      <div
        style={{
          display: "inline-block",
          transformOrigin: "top center",
          width: 480,
          height: 1000 + (hasShadow ? computedBlur * 0.8 : 0),
        }}
      >
        <div style={{ position: "relative", width: 480, height: 1000 }}>
          <div
            style={{
              position: "absolute",
              inset: "-400px",
              zIndex: 2,
              overflow: "visible",
              cursor: grabbing ? "grabbing" : modelHovered ? "grab" : "default",
              filter: "none",
              transition: "filter 0.15s ease",
              pointerEvents: "none",
              ...maskStyle,
            }}
            onPointerDownCapture={(e) => {
              const hit = hitsModel(e.clientX, e.clientY);

              if (!hit) {
                onSelectChange?.(false);
                e.stopPropagation();
                return;
              }

              onSelectChange?.(true);
              setGrabbing(true);
            }}
            onPointerMove={(e) => {
              if (!grabbing) {
                const isCurrentlyHovering = hitsModel(e.clientX, e.clientY);
                if (isCurrentlyHovering !== modelHovered) {
                  setModelHovered(isCurrentlyHovering);
                  onHoverChange?.(isCurrentlyHovering);
                }
              }
            }}
            onPointerUp={() => setGrabbing(false)}
            onPointerLeave={() => {
              setGrabbing(false);
              if (modelHovered) {
                setModelHovered(false);
                onHoverChange?.(false);
              }
            }}
          >
            <CanvasWithLoader
              imageUrl={imageUrl}
              imageMaskConfig={imageMaskConfig}
              cropArea={cropArea}
              initialRotationX={initialRotationX}
              initialRotationY={initialRotationY}
              initialRotationZ={initialRotationZ}
              onRotationChange={onRotationChange}
              rootRef={rootRef}
              cameraRef={cameraRef}
              zoom={zoom}
              onApi={onApi}
              onMount={handleCanvasMount}
              videoElement={videoElement}
              shadowIntensity={shadowIntensity}
              shadowColor={shadowColor}
              autoRotate={autoRotate}
              rotationSpeed={rotationSpeed}
              glow={glow}
              environment={environment}
              isSelected={isSelected}
              isHovered={modelHovered}
            />
          </div>
        </div>
      </div>
    </>
  );
}