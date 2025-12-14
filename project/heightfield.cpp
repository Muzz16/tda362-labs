
#include "heightfield.h"

#include <iostream>
#include <stdint.h>
#include <vector>
#include <glm/glm.hpp>
#include <stb_image.h>
#include <labhelper.h>

using namespace glm;
using std::string;

HeightField::HeightField(void)
    : m_meshResolution(0)
    , m_vao(UINT32_MAX)
    , m_positionBuffer(UINT32_MAX)
    , m_uvBuffer(UINT32_MAX)
    , m_indexBuffer(UINT32_MAX)
    , m_numIndices(0)
    , m_texid_hf(UINT32_MAX)
    , m_texid_diffuse(UINT32_MAX)
    , m_heightFieldPath("")
    , m_diffuseTexturePath("")
{
}

void HeightField::loadHeightField(const std::string& heigtFieldPath)
{
	int width, height, components;
	stbi_set_flip_vertically_on_load(true);
	float* data = stbi_loadf(heigtFieldPath.c_str(), &width, &height, &components, 1);
	if(data == nullptr)
	{
		std::cout << "Failed to load image: " << heigtFieldPath << ".\n";
		return;
	}

	if(m_texid_hf == UINT32_MAX)
	{
		glGenTextures(1, &m_texid_hf);
	}
	glBindTexture(GL_TEXTURE_2D, m_texid_hf);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);

	glTexImage2D(GL_TEXTURE_2D, 0, GL_R32F, width, height, 0, GL_RED, GL_FLOAT,
	             data); // just one component (float)

	m_heightFieldPath = heigtFieldPath;
	std::cout << "Successfully loaded heigh field texture: " << heigtFieldPath << ".\n";
}

void HeightField::loadDiffuseTexture(const std::string& diffusePath)
{
	int width, height, components;
	stbi_set_flip_vertically_on_load(true);
	uint8_t* data = stbi_load(diffusePath.c_str(), &width, &height, &components, 3);
	if(data == nullptr)
	{
		std::cout << "Failed to load image: " << diffusePath << ".\n";
		return;
	}

	if(m_texid_diffuse == UINT32_MAX)
	{
		glGenTextures(1, &m_texid_diffuse);
	}

	glBindTexture(GL_TEXTURE_2D, m_texid_diffuse);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
	glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
	glTexParameterf(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);

	glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB8, width, height, 0, GL_RGB, GL_UNSIGNED_BYTE, data); // plain RGB
	glGenerateMipmap(GL_TEXTURE_2D);

	std::cout << "Successfully loaded diffuse texture: " << diffusePath << ".\n";
}


void HeightField::generateMesh(int tesselation)
{
	// Store the resolution for later use
	m_meshResolution = tesselation;

	// Number of vertices per side
	int numVerticesPerSide = tesselation + 1;
	int totalVertices = numVerticesPerSide * numVerticesPerSide;

	// Create vectors to store vertex data
	std::vector<float> positions;
	std::vector<float> texcoords;
	std::vector<uint32_t> indices;

	positions.reserve(totalVertices * 3); // 3 floats per vertex (x,y,z)
	texcoords.reserve(totalVertices * 2); // 2 floats per vertex (u,v)

	// Generate vertex positions and texture coordinates
	// x, z in [-1, +1], y = 0
	// texture coordinates in [0, 1]

	// Loop over rows and columns to create a grid
	for (int row = 0; row < numVerticesPerSide; row++)
	{
		for (int col = 0; col < numVerticesPerSide; col++)
		{
			// Calculate normalized coordinates [0, 1]
			float u = float(col) / float(tesselation);
			float v = float(row) / float(tesselation);

			// Map to [-1, +1] for x and z
			// Mesh size of 2.0 units
			float x = u * 2.0f - 1.0f;
			float z = v * 2.0f - 1.0f;
			float y = 0.0f;

			// Add position
			positions.push_back(x);
			positions.push_back(y);
			positions.push_back(z);

			// Add texture coordinate
			texcoords.push_back(u);
			texcoords.push_back(v);
		}
	}

	// Generate triangle strip indices with primitive restart
	// Instead of defining 3 vertices per triangle, we zig-zag between rows.
	const uint32_t RESTART_INDEX = UINT32_MAX;

	for (int row = 0; row < tesselation; row++)
	{
		// Create a strip for this row
		for (int col = 0; col < numVerticesPerSide; col++)
		{
			// Bottom vertex of the quad
			int bottomVertex = row * numVerticesPerSide + col;
			// Top vertex of the quad
			int topVertex = (row + 1) * numVerticesPerSide + col;

			indices.push_back(bottomVertex);
			indices.push_back(topVertex);
		}

		// Add restart index after each row (except the last one)
		if (row < tesselation - 1)
		{
			indices.push_back(RESTART_INDEX);
		}
	}

	// Store the number of indices for rendering
	m_numIndices = indices.size();

	// Create vertex array object
	glGenVertexArrays(1, &m_vao);
	glBindVertexArray(m_vao);


	// Create and bind buffers
	m_indexBuffer = labhelper::createAddIndexBuffer(m_vao, indices.data(), indices.size() * sizeof(int));
	m_positionBuffer = labhelper::createAddAttribBuffer(m_vao, positions.data(), positions.size() * sizeof(float),
		/*attributeIndex=*/0, /*attribueSize=*/3, GL_FLOAT);
	m_uvBuffer = labhelper::createAddAttribBuffer(m_vao, texcoords.data(), texcoords.size() * sizeof(float),
		/*attributeIndex=*/2, /*attribueSize=*/2, GL_FLOAT);


}

void HeightField::submitTriangles(void)
{
	if (m_vao == UINT32_MAX)
	{
		std::cout << "No vertex array is generated, cannot draw anything.\n";
		return;
	}

	// Enable primitive restart
	glEnable(GL_PRIMITIVE_RESTART);
	// Set restart index
	glPrimitiveRestartIndex(UINT32_MAX);

	// Bind VAO and draw
	glBindVertexArray(m_vao);
	glDrawElements(GL_TRIANGLE_STRIP, m_numIndices, GL_UNSIGNED_INT, 0);

	// Disable primitive restart
	glDisable(GL_PRIMITIVE_RESTART);
}