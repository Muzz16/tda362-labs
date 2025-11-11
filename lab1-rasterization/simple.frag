#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

// Task 3: Add an input variable for colors from the vertex shader
in vec3 color;
layout(location = 0) out vec4 fragmentColor;

// Task 5: Add a uniform to tint all the pixels by some color
uniform vec3 triangleColor = vec3(1, 1, 1); // default to white, value is provided by the program and is the same for all vertices/fragments

void main()
{
// Task 3: Set the output color to be the incoming interpolated color received
	fragmentColor.rgb = color*triangleColor; // Calculate the color by multiplying the interpolated color by the triangle color

}
