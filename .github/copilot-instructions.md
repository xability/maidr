**Project Context:** We are building a multimodal access and interactive data representation system based on a strict, layered architecture designed for maintainability, testability, and extensibility. Adherence to these principles is paramount.

**Core Architectural Pillars:**

1.  **Unidirectional Dependency Flow:** UI → ViewModel → Service(s) → Core Model. Inner layers MUST NOT know about or depend on outer layers.
2.  **Separation of Concerns (SoC):** Each layer and service has a distinct, well-defined responsibility.
3.  **Loose Coupling & High Cohesion:** Minimize dependencies between components, especially within the Service layer, and ensure components group related functionalities.
4.  **Single Source of Truth (SSoT):** The Core Model (figure, subplot, trace data) is the ultimate source of truth for application data. Services derive state from it; ViewModels validate and prepare data for UI based on it.
5.  **Extensibility:** The architecture is designed to allow new services and UI features to be added with minimal impact on existing, unrelated components.

**What to Follow When Generating Code/Features:**

**I. Core Model Layer:**
_ **Purpose:** Defines the fundamental, raw data structures (e.g., `figure`, `subplot`, `trace`). This is the SSoT.
_ **Responsibilities:**
_ Hold the canonical data.
_ **Dependencies:** None (it's the innermost core). \* **Behavior:** Pure data, minimal logic.

**II. Service Layer:**
_ **Purpose:** Encapsulates all business logic, data transformations, and interactions with the Core Model.
_ **Responsibilities:**
_ Perform specific tasks (e.g., Text processing, Audio playback, Braille generation, Review logic, Autoplay functionality).
_ Interact with and transform data from the Core Model.
_ Emit events to notify ViewModels of changes or outcomes.
_ Strive to be as stateless as possible (relying on the Core Model and inputs for operations).
_ Each service should have a specific, narrow responsibility (e.g., `TextService` handles text formatting, state for different modes).
_ Auxiliary services (e.g., `AutoplayService`) may depend on core services (e.g., `TextService`) if logically required and to avoid code duplication (e.g., Review service leveraging Text service).

- **Dependencies:** Only on the Core Model and potentially other _logically related_ services.
- **When adding a new Service:**
  _ Define its specific responsibility.
  _ Ensure it only depends on the Core Model or essential peer services. \* Design its event emission for ViewModel consumption.

**III. ViewModel Layer:**
_ **Purpose:** Acts as an intermediary between the UI and the Service layer. Prepares data for display and handles UI logic.
_ **Responsibilities:**
_ Consume events and data from the Service layer.
_ Validate user inputs (from UI, keyboard) and events from the "outer world."
_ Unify various input sources (keyboard, UI clicks) into consistent actions/data.
_ Manage UI-specific state (e.g., current editing mode, selection states).
_ Format/transform data received from services into a presentation-ready format for the UI.
_ Expose data and commands to the UI (e.g., for React components).
_ Orchestrate calls to multiple services if a UI action requires it.
_ **Dependencies:** Only on the Service Layer(s).
_ **When adding ViewModel logic:**
_ Focus on data validation, state preparation for the UI, and handling user interactions. \* Delegate complex business logic to appropriate services.

**IV. UI Layer:**
_ **Purpose:** Renders the user interface and captures user input.
_ **Responsibilities:**
_ Strictly presentation: display data provided by the ViewModel.
_ Layout: organize visual elements.
_ Delegate all user actions and events to the ViewModel.
_ Remain "dumb" – minimal logic, primarily focused on rendering. (e.g., rendering a two-part settings panel with labels and input fields).
_ **Dependencies:** Only on the ViewModel Layer.
_ **When adding UI components:**
_ Ensure all data comes from the ViewModel.
_ Ensure all actions are routed through the ViewModel. \* Avoid embedding business or validation logic.

**V. General Principles for New Features:**
_ **Identify the Layer:** Determine which layer(s) the new logic belongs to.
_ **Follow Dependency Flow:** Ensure new code respects the UI → VM → Service → Core direction.
_ **Event-Driven Updates:** Changes in services should trigger events that ViewModels subscribe to, which then update the UI.
_ **Data Flow for Actions:** UI captures action → ViewModel validates/processes → ViewModel calls Service(s) → Service(s) interact with Core Model & perform logic → Service(s) emit event(s) → ViewModel updates → UI re-renders. \* **Modularity:** Aim for changes in one service/module to not necessitate changes in unrelated ones.

**What to Avoid (Anti-Patterns):**

1.  **Violating Dependency Direction:**
    - **NO** Core Model depending on Services, ViewModels, or UI.
    - **NO** Service depending on ViewModels or UI.
    - **NO** ViewModel depending on UI.
2.  **Leaking Responsibilities / "Seeping" Logic:**
    - **NO** business logic in ViewModels or UI components. (e.g., complex data transformation, core calculations).
    - **NO** UI layout/presentation logic in ViewModels or Services.
    - **NO** direct calls from UI to Services or Core Model.
    - **NO** validation logic (beyond basic UI hints) in the UI layer; primary validation is in the ViewModel.
    - **NO** Service A directly calling UI-specific methods of Service B.
3.  **Tight Coupling:**
    - **AVOID** services having unnecessary knowledge of other services' internal implementations. Communicate via well-defined interfaces or events.
    - **AVOID** creating a "god object" service or ViewModel that knows too much.
4.  **Bypassing Layers:** For example, the UI should never directly update the Core Model.
5.  **Over-Complicating the UI Layer:** The UI (e.g., Settings component) should focus on rendering and delegating actions, not performing complex state management or business logic itself.
6.  **Placing ViewModel Logic in Services:** Services should focus on business logic and data, not on preparing data _specifically_ for a particular view's display needs (that's the ViewModel's job).
7.  **Introducing Circular Dependencies** between any components or layers.
8.  **Excessive State in Services:** Services should primarily operate on inputs and the Core Model, minimizing their own persistent state.

## Commit Message Conventions

Always follow Conventional Commit specification.

## Linting

Always run `npm run lint -- --fix` before committing.
