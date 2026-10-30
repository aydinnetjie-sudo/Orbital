    # Orbital Engine Design

    ## Vision

    Orbital is a realistic 3D spaceflight simulator built entirely in JavaScript using Three.js.

    The goal is to create a seamless experience where the player can:

    - Build rockets
    - Launch from a planet
    - Reach orbit
    - Travel between planets
    - Land anywhere
    - Explore without loading screens

    The focus is on realistic physics, procedural planets, and smooth performance.

    ---

    # Engine Principles

    ## 1. Modular

    Every system should have one responsibility.

    Examples:

    - Planet generates terrain.
    - Rocket handles propulsion.
    - Physics handles movement.
    - World manages all objects.

    ---

    ## 2. Browser First

    Everything must run in GitHub Codespaces and modern browsers.

    No desktop software is required to develop the game.

    ---

    ## 3. Performance First

    Never generate more detail than necessary.

    Use:
    - Chunking
    - Level of Detail (LOD)
    - Procedural generation

    ---

    ## 4. Realistic Feel

    Physics should feel believable while remaining fun.

    Distances may be scaled, but:
    - gravity
    - orbital mechanics
    - staging
    - fuel

    should behave realistically.

    ---

    ## 5. Seamless World

    No loading screens.

    Players can fly from the surface to space continuously.

    ---

    ## Future Systems

    - Procedural planets
    - Atmospheres
    - Clouds
    - Oceans
    - Rocket builder
    - Orbital mechanics
    - Time warp
    - Career mode
    - Multiplayer (possible future)

    ---

    ## Coding Style

    - One class per file.
    - Keep methods short.
    - Avoid duplicate code.
    - Comment complex math.