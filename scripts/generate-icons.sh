#!/bin/sh

mkdir -p public/icons

convert -background none icon.svg -resize 16x16 public/icons/icon-16.png
convert -background none icon.svg -resize 32x32 public/icons/icon-32.png
convert -background none icon.svg -resize 48x48 public/icons/icon-48.png
convert -background none icon.svg -resize 128x128 public/icons/icon-128.png

echo "Icons generated successfully in public/icons/"
