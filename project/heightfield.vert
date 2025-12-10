#version 420
///////////////////////////////////////////////////////////////////////////////
// Input vertex attributes
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) in vec3 position;
layout(location = 2) in vec2 texCoordIn;

///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////

uniform mat4 normalMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 modelViewProjectionMatrix;

uniform sampler2D heightMap;
uniform float heightScale;

///////////////////////////////////////////////////////////////////////////////
// Output to fragment shader
///////////////////////////////////////////////////////////////////////////////
out vec2 texCoord;
out vec3 viewSpacePosition;
out vec3 viewSpaceNormal;

void main()
{
    // 1. Calculate the current height (Center)
    float h = texture(heightMap, texCoordIn).r * heightScale;
    
    // 2. Set the new position
    // We modify the Y component directly.
    vec3 mappedPos = vec3(position.x, h, position.z);

    // 3. Calculate the Normal Vector (The missing piece)
    // We sample the heights of the pixels to the Left, Right, Up, and Down.
    // textureOffset(sampler, coords, offset_in_pixels)
    float hL = textureOffset(heightMap, texCoordIn, ivec2(-1, 0)).r * heightScale;
    float hR = textureOffset(heightMap, texCoordIn, ivec2( 1, 0)).r * heightScale;
    float hD = textureOffset(heightMap, texCoordIn, ivec2( 0,-1)).r * heightScale;
    float hU = textureOffset(heightMap, texCoordIn, ivec2( 0, 1)).r * heightScale;

    // Deduce the normal vector from the height differences
    vec3 newNormal = normalize(vec3(hL - hR, 2.0, hD - hU));

    // 4. Apply Matrices
    gl_Position = modelViewProjectionMatrix * vec4(mappedPos, 1.0);
    
    // Transform the NEW normal by the normal matrix
    viewSpacePosition = (modelViewMatrix * vec4(mappedPos, 1.0)).xyz;
    viewSpaceNormal = normalize((normalMatrix * vec4(newNormal, 0.0)).xyz);
    

    texCoord = texCoordIn;
}
