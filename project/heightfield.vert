#version 420

layout(location = 0) in vec3 position;
layout(location = 2) in vec2 inTexCoord;

uniform mat4 modelViewProjectionMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 normalMatrix;
uniform mat4 lightMatrix;

uniform sampler2D heightMap; 
uniform float heightScale = 50.0; 

out vec2 texCoord;
out vec3 viewSpaceNormal;
out vec3 viewSpacePosition;
out vec4 shadowMapCoord;

void main()
{
    texCoord = inTexCoord;

    // Sample heightfield
    // Exaggerate the height by the height scale
    float h = texture(heightMap, texCoord).r;
    float worldY = h * heightScale;

    // Apply height to model position
    vec3 displacedPos = vec3(position.x, worldY, position.z);

    // Calculate the size of one pixel in UV coordinates.
    vec2 texelSize = 1.0 / textureSize(heightMap, 0);

    // Sample neighbors
    // Look at the height of the pixels to the right, left, up and down
    float hR = texture(heightMap, texCoord + vec2(texelSize.x, 0.0)).r; // step to the right
    float hL = texture(heightMap, texCoord - vec2(texelSize.x, 0.0)).r; // step to the left
    float hU = texture(heightMap, texCoord + vec2(0.0, texelSize.y)).r; // step up
    float hD = texture(heightMap, texCoord - vec2(0.0, texelSize.y)).r; // step down

    // Calculate slope in X and Z 
    // 4.0 is to account for the grid size [-1 ,1] (size 2) and 
    // the difference between two height samples (another factor of 2)
    float scaleFactor = heightScale / 4.0;

    // Calculate the change in height (the slope)
    float dX = ((hR - hL) / texelSize.x) * scaleFactor; // Height change from this pixel to the right and left
    float dZ = ((hU - hD) / texelSize.y) * scaleFactor; // Height change from this pixel to up and down

    // Compute tangent vectors
    // Moves 1 unit in X, dX units UP
    // Moves 1 unit in Z, dZ units UP
    vec3 tangentX = vec3(1.0, dX, 0.0); 
    vec3 tangentZ = vec3(0.0, dZ, 1.0);

    // Calculate the normal, take the cross product of the tangents, 
    // which gives us a perpendicular vector to both of them. 

    // Z x X because otherwise it will give us a normal pointing down
    vec3 worldSpaceNormal = normalize(cross(tangentZ, tangentX));

    // Transform world space into view space
    viewSpaceNormal = normalize(mat3(normalMatrix) * worldSpaceNormal);

    // Transform the displaced position into view space
    vec4 viewPos = modelViewMatrix * vec4(displacedPos, 1.0);
    viewSpacePosition = viewPos.xyz;

    // Calculate shadow map coordinates
    shadowMapCoord = lightMatrix * viewPos;
    gl_Position = modelViewProjectionMatrix * vec4(displacedPos, 1.0);
}