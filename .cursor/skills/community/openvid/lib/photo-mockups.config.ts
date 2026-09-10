export interface PhotoMockupScreenRect {
  top: number;
  left: number;
  width: number;
  height: number;
  cornerRadiusPct?: number;
}

export interface PhotoMockupConfig {
  imageSrc: string;
  naturalWidth: number;
  naturalHeight: number;
  screenRect: PhotoMockupScreenRect;
}

export const MACBOOK_PHOTO_MOCKUP: PhotoMockupConfig = {
  imageSrc: "/images/mockups/mac-book.webp",
  naturalWidth: 1294,
  naturalHeight: 819,
  screenRect: {
    top: 4.30,
    left: 9.73,
    width: 80.50,
    height: 83.10,
    cornerRadiusPct: 1,
  },
};