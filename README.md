# RoadSense – Intelligent Road Safety Navigation System

**Safer Routes. Smarter Decisions.**

RoadSense is a web-based road-safety navigation project designed to help users make more informed travel decisions by combining route planning with available traffic information, weather conditions, and road-hazard data.

The project aims to go beyond conventional navigation by presenting relevant road conditions and route information in an interactive interface, helping users understand their travel options before starting a journey.

## Overview

Road travel can be affected by traffic congestion, adverse weather, potholes, and other road hazards. Traditional navigation systems primarily focus on route guidance and estimated travel time, while additional road-safety information can help users make better-informed decisions.

RoadSense explores how mapping technologies, external APIs, and road-condition information can be combined to support safety-aware navigation.

## Objectives

- Develop an interactive map-based route navigation system.
- Display available route alternatives and their travel information.
- Integrate traffic and weather information where supported by the configured APIs.
- Provide an interface for viewing and reporting road hazards.
- Explore route scoring to compare travel options using relevant road conditions.
- Build a modular foundation for future road-safety intelligence features.

## Key Features

### 1. Interactive Map and Navigation
- Map-based visualization using Mapbox GL JS.
- Source and destination selection.
- Route calculation using a supported directions service.
- Display of available route alternatives and travel details.

### 2. Route Comparison
- Compare available routes using travel information such as distance and estimated duration.
- Provide a foundation for evaluating routes using road-safety considerations.
- Present route information to support user decision-making.

### 3. Traffic Information
- Integration with supported mapping and traffic services.
- Display available traffic information to help users understand road conditions.

### 4. Weather Information
- Integration with the OpenWeather API.
- Weather information to provide additional context for travel decisions when the API is configured.

### 5. Road Hazard and Pothole Reporting
- A user interface for road-hazard reporting.
- Support for incorporating reported hazards into the navigation experience, according to the available implementation.
- A foundation for future hazard verification and road-condition monitoring.

### 6. Safety-Aware Navigation
- A foundation for evaluating route conditions beyond travel time alone.
- Potential use of traffic, weather, and hazard information in route assessment.
- Future scope for explainable risk scoring and more comprehensive road-safety recommendations.

> **Important:** Route estimates and safety assessments are decision-support information, not guarantees of road safety. Users should follow traffic regulations, observe actual road conditions, and use their judgment while travelling.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React.js |
| Development and build tool | Vite |
| Programming language | JavaScript |
| Interactive maps | Mapbox GL JS |
| Routing | Mapbox Directions API or the configured routing service |
| Weather information | OpenWeather API |
| Styling | CSS / Tailwind CSS, as configured in the project |
| Browser-side storage | LocalStorage, where used |
| Version control | Git and GitHub |

## System Workflow

1. The user opens RoadSense and selects a source and destination.
2. The application requests route information from the configured directions service.
3. Available route alternatives and travel details are presented on the map.
4. Configured traffic and weather services provide additional travel context.
5. Available road-hazard information can be displayed to help the user assess route conditions.
6. The user reviews the available information and chooses a suitable route.

## Getting Started

### Prerequisites

Install the following before running the project:

- [Node.js](https://nodejs.org/)
- npm, which is included with Node.js
- A [Mapbox account](https://account.mapbox.com/) and access token
- An [OpenWeather account](https://openweathermap.org/) and API key, if weather integration is enabled

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/deepak251817-collab/Enhanced-Road-Safety-Navigation.git
```

**2. Open the project directory**

```bash
cd Enhanced-Road-Safety-Navigation
```

**3. Install dependencies**

```bash
npm install
```

**4. Configure environment variables**

Create a `.env.local` file in the project root and add the required API credentials.

```env
VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_access_token
VITE_OPENWEATHER_API_KEY=your_openweather_api_key
```

Use the exact variable names referenced by the application code. If your project uses different names, update the example accordingly.

**5. Start the development server**

```bash
npm run dev
```

Open the local URL printed in your terminal, usually:

```text
http://localhost:5173
```

### Production Build

To create a production build, run:

```bash
npm run build
```

To preview the production build locally, run:

```bash
npm run preview
```

## Environment Configuration

RoadSense uses external services for mapping and related information. The corresponding credentials and service configuration must be supplied before those integrations can work.

- **Mapbox:** Required for map rendering and any Mapbox services enabled by the application.
- **OpenWeather:** Required for weather features that use the OpenWeather API.
- **Routing service:** Configure the directions provider used by the current implementation.

Do not commit `.env`, `.env.local`, or files containing actual API credentials to GitHub. Use restricted public tokens where supported, configure provider-side usage limits, and rotate any credentials that may already have been exposed in a public repository.

## Current Scope and Limitations

RoadSense is a developing project and should be treated as a prototype rather than a production-ready navigation service.

- Route quality depends on the configured routing provider and the data it returns.
- Traffic and weather information depend on API availability, configuration, and data freshness.
- Hazard coverage depends on the availability and reliability of reported road-condition data.
- Browser LocalStorage, where used, stores information locally and does not automatically synchronize reports between users or devices.
- Safety scores should not be described as validated predictions unless they have been tested against reliable real-world data.
- The application does not guarantee that a selected route is free from potholes, congestion, dangerous weather, or other hazards.

## Future Enhancements

- Develop and validate a more comprehensive road-risk scoring system.
- Integrate a trained pothole-detection model.
- Introduce a backend and centralized database for shared hazard reports.
- Add hazard verification, severity classification, and report status tracking.
- Improve route comparisons using validated traffic, weather, and road-condition data.
- Add automated testing, monitoring, and deployment improvements.
- Evaluate route recommendations using real-world road conditions and test scenarios.

These enhancements represent potential future development and are not necessarily available in the current version.

## Project Team

**Developed by:**

- **Deepak R**
- **Yashaswini M**

## Project Purpose

RoadSense explores the use of web mapping, road-condition data, and software-based analysis to make road travel information more accessible. The long-term goal is to support safer travel decisions through more informative navigation and road-hazard awareness.

---

**RoadSense — Safer Routes. Smarter Decisions.**
