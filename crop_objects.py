from PIL import Image
import os

def process_image(file_path, prefix, output_dir="assets"):
    print(f"Processing {file_path}...")
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    img = Image.open(file_path).convert("RGBA")
    width, height = img.size
    
    # Use alpha channel as mask
    alpha = img.split()[3]
    # Filter to ignore low-alpha (background/noise)
    mask = alpha.point(lambda p: 255 if p > 100 else 0)
    
    # Clear edges to avoid border artifacts
    mask_load = mask.load()
    border = 5
    for x in range(width):
        for y in range(border): mask_load[x, y] = 0
        for y in range(height - border, height): mask_load[x, y] = 0
    for y in range(height):
        for x in range(border): mask_load[x, y] = 0
        for x in range(width - border, width): mask_load[x, y] = 0

    objs = []
    
    # Iteratively find and erase components
    while True:
        bbox = mask.getbbox()
        if not bbox:
            break
            
        # Find a seed pixel in the bbox
        seed = None
        for y in range(bbox[1], bbox[3]):
            for x in range(bbox[0], bbox[2]):
                if mask_load[x, y] == 255:
                    seed = (x, y)
                    break
            if seed: break
        
        if not seed: break
        
        # Flood fill to find all pixels of this component and erase them from mask
        xmin, ymin, xmax, ymax = seed[0], seed[1], seed[0], seed[1]
        stack = [seed]
        mask_load[seed[0], seed[1]] = 0
        
        while stack:
            cx, cy = stack.pop()
            xmin = min(xmin, cx)
            xmax = max(xmax, cx)
            ymin = min(ymin, cy)
            ymax = max(ymax, cy)
            
            for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
                nx, ny = cx+dx, cy+dy
                if 0 <= nx < width and 0 <= ny < height and mask_load[nx, ny] == 255:
                    mask_load[nx, ny] = 0
                    stack.append((nx, ny))
        
        # Filter noise (less than 100 pixels area)
        if (xmax - xmin) * (ymax - ymin) > 100:
            objs.append((xmin, ymin, xmax, ymax))
            
    # Keep top 4 by area
    objs.sort(key=lambda b: (b[2]-b[0]) * (b[3]-b[1]), reverse=True)
    top_4 = objs[:4]
    
    # Sort for 2x2 grid: (Row 1 Left, Row 1 Right, Row 2 Left, Row 2 Right)
    top_4.sort(key=lambda b: (b[1] > height/2, b[0] > width/2))

    for i, bbox in enumerate(top_4):
        padding = 5
        crop_box = (max(0, bbox[0] - padding), max(0, bbox[1] - padding),
                     min(width, bbox[2] + padding), min(height, bbox[3] + padding))
        obj_img = img.crop(crop_box)
        output_name = os.path.join(output_dir, f"{prefix}_{i+1}.png")
        obj_img.save(output_name)
        print(f"Saved {output_name} with size {obj_img.size}")

if __name__ == "__main__":
    process_image("assets/PS5.png", "Dualsense_Black")
