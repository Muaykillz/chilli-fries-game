from PIL import Image

def clean_image(file_path):
    print(f"Cleaning {file_path}...")
    img = Image.open(file_path).convert("RGBA")
    width, height = img.size
    pix = img.load()
    
    # Use alpha > 120 as a strict threshold for the main object
    mask = Image.new("L", (width, height), 0)
    mask_pix = mask.load()
    for y in range(height):
        for x in range(width):
            if pix[x, y][3] > 120:
                mask_pix[x, y] = 255
    
    # Find the largest component (should be the chili)
    # Start seed from the middle area
    seed = None
    for y in range(height // 4, 3 * height // 4):
        for x in range(width // 4, 3 * width // 4):
            if mask_pix[x, y] == 255:
                seed = (x, y)
                break
        if seed: break
    
    if not seed:
        print("Could not find main object seed.")
        return

    # Flood fill to keep only the main body
    keep_mask = Image.new("L", (width, height), 0)
    keep_pix = keep_mask.load()
    stack = [seed]
    keep_pix[seed[0], seed[1]] = 255
    mask_pix[seed[0], seed[1]] = 0 # Erase from search mask
    
    while stack:
        cx, cy = stack.pop()
        for dx, dy in [(-1,0),(1,0),(0,-1),(0,1)]:
            nx, ny = cx+dx, cy+dy
            if 0 <= nx < width and 0 <= ny < height and mask_pix[nx, ny] == 255:
                mask_pix[nx, ny] = 0
                keep_pix[nx, ny] = 255
                stack.append((nx, ny))
    
    # Apply the keep_mask to the original image's alpha
    new_img = img.copy()
    new_pix = new_img.load()
    for y in range(height):
        for x in range(width):
            if keep_pix[x, y] == 0:
                # Set alpha to 0 for anything not in the main component
                r, g, b, a = new_pix[x, y]
                new_pix[x, y] = (r, g, b, 0)
                
    new_img.save(file_path)
    print(f"Successfully cleaned and saved {file_path}")

if __name__ == "__main__":
    clean_image("assets/Chilli_2.png")
