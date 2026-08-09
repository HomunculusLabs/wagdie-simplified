import React from 'react';

type ImageSource = string | { src: string };

type ImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'> & {
  src: ImageSource;
  alt: string;
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  unoptimized?: boolean;
};

export default function Image(props: ImageProps): JSX.Element {
  const { src, alt, width, height, fill, unoptimized: _unoptimized, onError, className, style, ...rest } = props;
  const resolvedSrc = typeof src === 'string' ? src : src.src;
  const mergedStyle = fill ? { ...(style || {}), width: '100%', height: '100%' } : style;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      onError={onError}
      className={className}
      style={mergedStyle}
      {...rest}
    />
  );
}
