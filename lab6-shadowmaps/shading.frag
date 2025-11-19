#version 420

// required by GLSL spec Sect 4.5.3 (though nvidia does not, amd does)
precision highp float;

///////////////////////////////////////////////////////////////////////////////
// Material
///////////////////////////////////////////////////////////////////////////////
uniform vec3 material_color;
uniform float material_metalness;
uniform float material_fresnel;
uniform float material_shininess;
uniform vec3 material_emission;

uniform int has_color_texture;
layout(binding = 0) uniform sampler2D colorMap;
uniform int has_emission_texture;
layout(binding = 5) uniform sampler2D emissiveMap;



///////////////////////////////////////////////////////////////////////////////
// Environment
///////////////////////////////////////////////////////////////////////////////
layout(binding = 6) uniform sampler2D environmentMap;
layout(binding = 7) uniform sampler2D irradianceMap;
layout(binding = 8) uniform sampler2D reflectionMap;
uniform float environment_multiplier;

///////////////////////////////////////////////////////////////////////////////
// Light source
///////////////////////////////////////////////////////////////////////////////
uniform vec3 point_light_color = vec3(1.0, 1.0, 1.0);
uniform float point_light_intensity_multiplier = 50.0;

///////////////////////////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////////////////////////
#define PI 3.14159265359

///////////////////////////////////////////////////////////////////////////////
// Input varyings from vertex shader
///////////////////////////////////////////////////////////////////////////////
in vec2 texCoord;
in vec3 viewSpaceNormal;
in vec3 viewSpacePosition;


///////////////////////////////////////////////////////////////////////////////
// Input uniform variables
///////////////////////////////////////////////////////////////////////////////
uniform mat4 viewInverse;
uniform vec3 viewSpaceLightPosition;

///////////////////////////////////////////////////////////////////////////////
// Output color
///////////////////////////////////////////////////////////////////////////////
layout(location = 0) out vec4 fragmentColor;



in vec4 shadowMapCoord;
layout(binding = 10) uniform sampler2DShadow shadowMapTex;

uniform int useSpotLight;
uniform int useSoftFalloff;
uniform vec3 viewSpaceLightDir;
uniform float spotInnerAngle;
uniform float spotOuterAngle;

vec3 calculateDirectIllumiunation(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 direct_illum = base_color;

	const float d = length(viewSpaceLightPosition - viewSpacePosition); // distance from fragment to light source
	const float d2 = 1.0 / (d * d); // 1 / d^2
	vec3 Li = point_light_intensity_multiplier * point_light_color * d2; // Li 
	vec3 wi = normalize(viewSpaceLightPosition - viewSpacePosition); // direction from fragment to light source
	if ( dot(n,wi) <= 0.0 ) { // if n <= 0, light is backfacing, return black
		return vec3(0.0);
	}

	const float nwi = max(0.0001, dot(n,wi));
	const float p = 1.0 / PI;
	vec3 diffuse_term = base_color * nwi * p * Li;
	direct_illum = diffuse_term;


	vec3 wh = normalize(wo + wi);
	const float F = material_fresnel + (1.0 - material_fresnel) * pow(1.0 - dot(wh, wi), 5.0);

	float dotnwh = max(dot(n, wh), 0.0001); // Avoid NaN to avoid pink pixels
	float dotnwo = max(dot(n, wo), 0.0001);
	float dotwowh = max(dot(wo, wh), 0.0001);

	float s = material_shininess;
	float dterm1 = (s + 2.0) / (2.0 * PI);
	float dterm2 = pow(dotnwh, s);
	float D = dterm1 * dterm2; // D(wh)

	float gterm1 = (2.0 * dotnwh * dotnwo) / dotwowh;
	float gterm2 = (2.0 * dotnwh * nwi) / dotwowh;
	float G = min(1.0, min(gterm1, gterm2)); // G(wi, wo)
	float denom = 4.0 * clamp(dotnwo * nwi, 0.0001, 1.0); // make sure the value is not 0 to avoid NaN

	float brdf = (F * D * G) / denom; // BRDF

	vec3 dielectric_term = brdf * nwi * Li + (1.0 - F) * diffuse_term; // dielectric term
	vec3 metal_term = brdf * base_color * nwi * Li; // metal term
	vec3 term = material_metalness * metal_term + (1.0 - material_metalness) * dielectric_term; // final value for direct illum
	direct_illum = term;

	return direct_illum;
}

vec3 calculateIndirectIllumination(vec3 wo, vec3 n, vec3 base_color)
{
	vec3 indirect_illum = vec3(0.f);
	///////////////////////////////////////////////////////////////////////////
	// Task 5 - Lookup the irradiance from the irradiance map and calculate
	//          the diffuse reflection
	///////////////////////////////////////////////////////////////////////////
	// Calculate the spherical coordinates of the direction


	vec3 world_normal = vec3(viewInverse * vec4(n, 0.0)); // normal in world space

	float theta = acos(max(-1.0f, min(1.0f, world_normal.y)));
	float phi = atan(world_normal.z, world_normal.x);
	if(phi < 0.0f)
	{
		phi = phi + 2.0f * PI;
	}

	vec2 lookup = vec2(phi / (2.0 * PI), 1 - theta / PI);
	vec3 Li = environment_multiplier * texture(irradianceMap, lookup).rgb; // incoming radiance from the environment
	vec3 diffuse_term = base_color * (1.0 / PI) * Li; // diffuse reflection
	indirect_illum = diffuse_term;


	///////////////////////////////////////////////////////////////////////////
	// Task 6 - Look up in the reflection map from the perfect specular
	//          direction and calculate the dielectric and metal terms.
	///////////////////////////////////////////////////////////////////////////
	vec3 wi = normalize(reflect(-wo, n)); // perfect reflection direction in view space
	vec3 wr = normalize(vec3(viewInverse * vec4(wi, 0.0))); // perfect reflection direction in world space

	theta = acos(max(-1.0f, min(1.0f, wr.y)));
	phi = atan(wr.z, wr.x);
	if(phi < 0.0f)
		phi = phi + 2.0f * PI;
	lookup = vec2(phi / (2.0 * PI), 1 - theta / PI);

	float s = material_shininess;
	float r1 = sqrt(2.0 / (s + 2.0)); // term for roughness
	float roughness = sqrt(r1); // roughness value
	Li = environment_multiplier * textureLod(reflectionMap, lookup, roughness * 7.0).rgb; // incoming radiance from the reflection map
	
	vec3 wh = normalize(wo + wi);
	float dotwowh = max(dot(wo,wh), 0.0);
	float F = material_fresnel + (1.0 - material_fresnel) * pow(1.0 - dotwowh, 5.0); // F
	vec3 dielectric_term = F * Li + (1.0 - F) * diffuse_term; // dielectric term
	vec3 metal_term = F * base_color * Li; // metal term
	vec3 term = material_metalness * metal_term + (1.0 - material_metalness) * dielectric_term; // final value for indirect illum
	indirect_illum = term;


	return indirect_illum;
}

void main()
{
	float visibility = 1.0;
	float attenuation = 1.0;

	visibility = textureProj(shadowMapTex, shadowMapCoord);

	attenuation = 1.0;
	if(useSpotLight == 1)
	{
		vec3 posToLight = normalize(viewSpaceLightPosition - viewSpacePosition);
		float cosAngle = dot(posToLight, -viewSpaceLightDir);

		if(useSoftFalloff == 0)
		{
			// Spotlight with hard border:
			attenuation = (cosAngle > spotOuterAngle) ? 1.0 : 0.0;
		}
		else
		{
			// Spotlight with soft border:
			attenuation = smoothstep(spotOuterAngle, spotInnerAngle, cosAngle);
		}

		visibility *= attenuation;
	}

	vec3 wo = -normalize(viewSpacePosition);
	vec3 n = normalize(viewSpaceNormal);

	vec3 base_color = material_color;
	if(has_color_texture == 1)
	{
		base_color = texture(colorMap, texCoord).rgb;
	}

	// Direct illumination
	vec3 direct_illumination_term = visibility * calculateDirectIllumiunation(wo, n, base_color);

	// Indirect illumination
	vec3 indirect_illumination_term = calculateIndirectIllumination(wo, n, base_color);

	///////////////////////////////////////////////////////////////////////////
	// Add emissive term. If emissive texture exists, sample this term.
	///////////////////////////////////////////////////////////////////////////
	vec3 emission_term = material_emission;
	if(has_emission_texture == 1)
	{
		emission_term = texture(emissiveMap, texCoord).rgb;
	}

	vec3 shading = direct_illumination_term + indirect_illumination_term + emission_term;

	fragmentColor = vec4(shading, 1.0);
	return;
}
