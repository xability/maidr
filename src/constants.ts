type EventType = "click" | "keydown" | "blur" | "keyup";

export class Constants {
  chartContainerId = "chart-container";
  mainContainerId = "maidr-container";

  brailleContainerId = "braille-div";
  brailleInputId = "braille-input";
  brailleInput: HTMLInputElement | null = null;

  infoId = "info";
  infoDiv: HTMLElement | null = null;

  announcementContainerId = "announcements";

  announcementContainer: HTMLElement | null = null;

  LLMmaxResponseTokens = 1000;

  endChimeId = "end_chime";

  containerId = "container";
  projectId = "maidr";

  chartId = "";
  chart: HTMLElement | null = null;
  chartContainer: HTMLDivElement | null = null;
  mainContainer: HTMLDivElement | null = null;

  events: Array<
    [
      HTMLElement | HTMLElement[] | Document,
      EventType,
      (e: KeyboardEvent) => void
    ]
  > = [];
  postLoadEvents: Array<[HTMLElement | HTMLElement[], string, EventListener]> =
    [];

  textMode: "off" | "terse" | "verbose" = "verbose";
  brailleMode: "off" | "on" = "off";
  soundMode: "on" | "off" | "sep" | "same" = "on";
  reviewMode: "off" | "on" = "off";

  minX = 0;
  maxX = 0;
  minY = 0;
  maxY = 0;
  plotId = "";
  chartType = "";
  navigation = 1;

  MAX_FREQUENCY = 1000;
  MIN_FREQUENCY = 200;
  NULL_FREQUENCY = 100;
  combinedVolMin = 0.25;
  combinedVolMax = 1.25;

  MAX_SPEED = 500;
  MIN_SPEED = 50;
  DEFAULT_SPEED = 250;
  INTERVAL = 20;
  AUTOPLAY_DURATION = 5000;

  vol = 0.5;
  MAX_VOL = 30;
  autoPlayRate = this.DEFAULT_SPEED;
  colorSelected = "#03C809";
  brailleDisplayLength = 32;

  showRect = 1;
  hasRect = 1;
  hasSmooth = 1;
  duration = 0.3;
  outlierDuration = 0.06;
  autoPlayOutlierRate = 50;
  autoPlayPointsRate = 50;
  colorUnselected = "#595959";
  canTrack = 0;
  isTracking = 1;
  visualBraille = false;
  ariaMode: "assertive" | "polite" = "assertive";

  userSettingsKeys = [
    "vol",
    "autoPlayRate",
    "brailleDisplayLength",
    "colorSelected",
    "MIN_FREQUENCY",
    "MAX_FREQUENCY",
    "keypressInterval",
    "ariaMode",
    "openAIAuthKey",
    "geminiAuthKey",
    "skillLevel",
    "skillLevelOther",
    "LLMModel",
    "LLMPreferences",
    "LLMOpenAiMulti",
    "LLMGeminiMulti",
    "autoInitLLM",
  ];

  openAIAuthKey: string | null = null;
  geminiAuthKey: string | null = null;
  maxLLMResponseTokens = 1000;
  playLLMWaitingSound = true;
  LLMDetail: "low" | "high" = "high";
  LLMModel: "openai" | "gemini" | "multi" = "openai";
  LLMSystemMessage =
    "You are a helpful assistant describing the chart to a blind person. ";
  skillLevel: "basic" | "intermediate" | "expert" | "other" = "basic";
  skillLevelOther = "";
  autoInitLLM = true;
  verboseText = "";
  waitingQueue = 0;

  showDisplay = 1;
  showDisplayInBraille = 1;
  showDisplayInAutoplay = 0;
  outlierInterval: number | null = null;

  isMac = navigator.userAgent.toLowerCase().includes("mac");
  control = this.isMac ? "Cmd" : "Ctrl";
  alt = this.isMac ? "option" : "Alt";
  home = this.isMac ? "fn + Left arrow" : "Home";
  end = this.isMac ? "fn + Right arrow" : "End";

  keypressInterval = 2000;
  tabMovement: number | null = null;

  debugLevel = 3;
  manualData = true;
  brailleContainer: HTMLElement | null = null;

  lastx = 0;

  constructor() {}
  ConvertHexToRGBString(hexColorString: string): string {
    return (
      "rgb(" +
      parseInt(hexColorString.slice(1, 3), 16) +
      "," +
      parseInt(hexColorString.slice(3, 5), 16) +
      "," +
      parseInt(hexColorString.slice(5, 7), 16) +
      ")"
    );
  }
  ColorInvert(color: string): string {
    const rgb = color.replace(/[^\d,]/g, "").split(",");
    const r = 255 - parseInt(rgb[0]);
    const g = 255 - parseInt(rgb[1]);
    const b = 255 - parseInt(rgb[2]);
    return `rgb(${r},${g},${b})`;
  }

  GetBetterColor(oldColor: string): string {
    if (oldColor.indexOf("#") !== -1) {
      oldColor = this.ConvertHexToRGBString(oldColor);
    }
    let newColor = this.ColorInvert(oldColor);
    const rgb = newColor.replace(/[^\d,]/g, "").split(",");
    if (
      Math.abs(parseInt(rgb[1]) - parseInt(rgb[0])) < 10 &&
      Math.abs(parseInt(rgb[2]) - parseInt(rgb[0])) < 10 &&
      (parseInt(rgb[0]) > 86 || parseInt(rgb[0]) < 169)
    ) {
      newColor = this.colorSelected;
    }
    return newColor;
  }

  GetStyleArrayFromString(styleString: string): string[] {
    return styleString.replaceAll(" ", "").split(/[:;]/);
  }

  GetStyleStringFromArray(styleArray: string[]): string {
    let styleString = "";
    for (let i = 0; i < styleArray.length; i++) {
      if (i % 2 === 0) {
        if (i !== styleArray.length - 1) {
          styleString += styleArray[i] + ": ";
        } else {
          styleString += styleArray[i];
        }
      } else {
        styleString += styleArray[i] + "; ";
      }
    }
    return styleString;
  }
  static readonly OSCILLATOR_TYPES = {
    SINE: 'sine' as OscillatorType,
    SQUARE: 'square' as OscillatorType,
    SAWTOOTH: 'sawtooth' as OscillatorType,
    TRIANGLE: 'triangle' as OscillatorType
  };
}

export class Resources {
  strings: { [key: string]: string } = {
    upper_outlier: "Upper Outlier",
    lower_outlier: "Lower Outlier",
    min: "Minimum",
    max: "Maximum",
    25: "25%",
    50: "50%",
    75: "75%",
    q1: "25%",
    q2: "50%",
    q3: "75%",
    son_on: "Sonification on",
    son_off: "Sonification off",
    son_des: "Sonification descrete",
    son_comp: "Sonification compare",
    son_ch: "Sonification chord",
    son_sep: "Sonification separate",
    son_same: "Sonification combined",
    empty: "Empty",
    openai: "OpenAI Vision",
    gemini: "Gemini Pro Vision",
    multi: "Multiple AI",
    processing: "Processing Chart...",
  };

  GetString(id: string): string {
    return this.strings[id];
  }
}

export class ChatLLM {
  firstTime = true;
  firstMulti = true;
  firstOpen = true;
  shown = false;
  whereWasMyFocus: HTMLElement | null = null;
  waitingInterval: ReturnType<typeof setInterval> | null = null;
  waitingSoundOverride: ReturnType<typeof setTimeout> | null = null;
  requestJson: any = null;
  LLMImage: string | null = null;
  tabMovement: number | null = null;

  CreateComponent() {
    const html = `
        <div id="chatLLM" class="modal hidden" role="dialog" tabindex="-1">
            <div class="modal-dialog" role="document" tabindex="0">
                <div class="modal-content">
                    <div class="modal-header">
                        <h2 id="chatLLM_title" class="modal-title">Ask a Question</h2>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="chatLLM_chat_history_wrapper">
                        <div id="chatLLM_chat_history" aria-live="${window.constants.ariaMode}" aria-relevant="additions">
                        </div>
                        <p id="chatLLM_copy_all_wrapper"><button id="chatLLM_copy_all">Copy all to clipboard</button></p>
                        </div>
                        <div id="chatLLM_content">
                          <p><input type="text" id="chatLLM_input" class="form-control" name="chatLLM_input" aria-labelledby="chatLLM_title" size="50"></p>
                          <div class="LLM_suggestions">
                            <p><button type="button">What is the title?</button></p>
                            <p><button type="button">What are the high and low values?</button></p>
                            <p><button type="button">What is the general shape of the chart?</button></p>
                          </div>
                          <div id="more_suggestions_container" class="LLM_suggestions">
                            <p><button type="button">Please provide the title of this visualization, then provide a description for someone who is blind or low vision. Include general overview of axes and the data at a high-level.</button></p>
                            <p><button type="button">For the visualization I shared, please provide the following (where applicable): mean, standard deviation, extreme, correlations, relational comparisons like greater than OR lesser than.</button></p>
                            <p><button type="button">Based on the visualization shared, address the following: Do you observe any unforeseen trends? If yes, what?  Please convey any complex multi-faceted patterns present. Can you identify any noteworthy exceptions that aren't readily apparent through non-visual methods of analysis?</button></p>
                            <p><button type="button">Provide context to help explain the data depicted in this visualization based on domain-specific insight.</button></p>
                          </div>
                          <p><button type="button" id="chatLLM_submit">Submit</button></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                      <button type="button" id="reset_chatLLM">Reset</button>
                      <button type="button" id="close_chatLLM">Close</button>
                    </div>
                </div>
            </div>
        </div>
        <div id="chatLLM_modal_backdrop" class="modal-backdrop hidden"></div>
    `;
    document.querySelector("body")?.insertAdjacentHTML("beforeend", html);
  }

  setEvents() {
    let constants = window.constants;
    const allClose = document.querySelectorAll(
      "#close_chatLLM, #chatLLM .close"
    );
    allClose.forEach((closeElem) =>
      window.constants.events.push([
        closeElem as HTMLElement,
        "click",
        () => {
          this.Toggle(false);
        },
      ])
    );
    window.constants.events.push([
      document.getElementById("chatLLM")!,
      "keyup",
      (e) => {
        if (e.key === "Esc") {
          this.Toggle(false);
        }
      },
    ]);

    window.constants.events.push([
      document,
      "keyup",
      (e) => {
        if ((e.key === "?" && (e.ctrlKey || e.metaKey)) || e.key === "¿") {
          this.Toggle();
        }
      },
    ]);

    window.constants.events.push([
      document.getElementById("chatLLM_submit")!,
      "click",
      () => {
        const text = (
          document.getElementById("chatLLM_input") as HTMLInputElement
        ).value;
        this.DisplayChatMessage("User", text);
        this.Submit(text);
      },
    ]);

    window.constants.events.push([
      document.getElementById("chatLLM_input")!,
      "keyup",
      (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          const text = (
            document.getElementById("chatLLM_input") as HTMLInputElement
          ).value;
          this.DisplayChatMessage("User", text);
          this.Submit(text);
        }
      },
    ]);

    const suggestions = document.querySelectorAll(
      "#chatLLM .LLM_suggestions button:not(#more_suggestions)"
    );
    suggestions.forEach((suggestion) =>
      window.constants.events.push([
        suggestion as HTMLElement,
        "click",
        (e) => {
          const text = (e.target as HTMLElement).innerHTML;
          this.DisplayChatMessage("User", text);
          this.Submit(text);
        },
      ])
    );

    window.constants.events.push([
      document.getElementById("delete_openai_key")!,
      "click",
      () => {
        (document.getElementById("openai_auth_key") as HTMLInputElement).value =
          "";
      },
    ]);
    window.constants.events.push([
      document.getElementById("delete_gemini_key")!,
      "click",
      () => {
        (document.getElementById("gemini_auth_key") as HTMLInputElement).value =
          "";
      },
    ]);

    window.constants.events.push([
      document.getElementById("reset_chatLLM")!,
      "click",
      () => {
        this.ResetLLM();
      },
    ]);

    window.constants.events.push([
      document.getElementById("chatLLM")!,
      "click",
      (e) => {
        this.CopyChatHistory(e);
      },
    ]);

    window.constants.events.push([
      document.getElementById("chatLLM")!,
      "keyup",
      (e) => {
        this.CopyChatHistory(e);
      },
    ]);
  }

  CopyChatHistory(e?: Event | KeyboardEvent) {
    let text = "";
    if (typeof e === "undefined") {
      text = document.getElementById("chatLLM_chat_history")!.innerHTML;
    } else if (e.type === "click") {
      if ((e.target as HTMLElement).id === "chatLLM_copy_all") {
        text = document.getElementById("chatLLM_chat_history")!.innerHTML;
      } else if (
        (e.target as HTMLElement).classList.contains(
          "chatLLM_message_copy_button"
        )
      ) {
        text = (e.target as HTMLElement).closest("p")!.previousElementSibling!
          .innerHTML;
      }
    } else if (e.type === "keyup" && e instanceof KeyboardEvent) {
      if (
        e.key === "C" &&
        ((e as KeyboardEvent).ctrlKey ||
          (e as KeyboardEvent).metaKey ||
          (e as KeyboardEvent).altKey) &&
        (e as KeyboardEvent).shiftKey
      ) {
        e.preventDefault();
        const elem = document.querySelector(
          "#chatLLM_chat_history > .chatLLM_message_other:last-of-type"
        );
        if (elem) {
          text = elem.innerHTML;
        }
      } else if (
        e.key === "A" &&
        ((e as KeyboardEvent).ctrlKey ||
          (e as KeyboardEvent).metaKey ||
          (e as KeyboardEvent).altKey) &&
        (e as KeyboardEvent).shiftKey
      ) {
        e.preventDefault();
        text = document.getElementById("chatLLM_chat_history")!.innerHTML;
      }
    }

    if (text !== "") {
      const cleanElems = document.createElement("div");
      cleanElems.innerHTML = text;
      const removeThese = cleanElems.querySelectorAll(".chatLLM_message_copy");
      removeThese.forEach((elem) => elem.remove());

      let markdown = this.htmlToMarkdown(cleanElems);
      markdown = markdown.replace(/\n{3,}/g, "\n\n");

      try {
        navigator.clipboard.writeText(markdown);
      } catch (err) {
        console.error("Failed to copy: ", err);
      }
      return markdown;
    }
  }

  htmlToMarkdown(element: HTMLElement): string {
    let markdown = "";

    const convertElementToMarkdown = (element: Element): string => {
      switch (element.tagName) {
        case "H1":
          return `# ${element.textContent}`;
        case "H2":
          return `## ${element.textContent}`;
        case "H3":
          return `### ${element.textContent}`;
        case "H4":
          return `#### ${element.textContent}`;
        case "H5":
          return `##### ${element.textContent}`;
        case "H6":
          return `###### ${element.textContent}`;
        case "P":
          return element.textContent!;
        case "DIV":
          return (
            Array.from(element.childNodes)
              .map((child) => convertElementToMarkdown(child as Element))
              .join("\n") + "\n\n"
          );
        default:
          return Array.from(element.childNodes)
            .map((child) => convertElementToMarkdown(child as Element))
            .join("");
      }
    };

    if (element.nodeType === Node.ELEMENT_NODE) {
      markdown += convertElementToMarkdown(element);
    } else if (
      element.nodeType === Node.TEXT_NODE &&
      element.textContent!.trim() !== ""
    ) {
      markdown += element.textContent!.trim();
    }

    return markdown.trim();
  }

  async Submit(text: string, firsttime = false) {
    let img = null;
    let constants = window.constants;
    this.firstMulti = true;

    if (
      (this.firstOpen || window.constants.LLMModel === "gemini") &&
      !firsttime &&
      window.constants.verboseText.length > 0
    ) {
      text =
        "Here is the current position in the chart; no response necessarily needed, use this info only if it's relevant to future questions: " +
        window.constants.verboseText +
        ". My question is: " +
        text;

      this.firstOpen = false;
    }

    if (window.constants.playLLMWaitingSound) {
      this.WaitingSound(true);
    }

    if (window.constants.LLMModel === "openai") {
      if (firsttime) {
        img = await this.ConvertSVGtoJPG(window.maidr!.id, "openai");
      }
      this.OpenAIPrompt(text, img);
    }
  }

  WaitingSound(onoff = true) {
    const delay = 1000;
    const freq = 440;
    const inprogressFreq = freq * 2;

    if (onoff) {
      if (this.waitingInterval) {
        clearInterval(this.waitingInterval);
        this.waitingInterval = null;
      }
      if (this.waitingSoundOverride) {
        clearTimeout(this.waitingSoundOverride);
        this.waitingSoundOverride = null;
      }
    } else {
      if (window.audio && this.shown) {
        window.audio.playOscillator(inprogressFreq, 0.2, 0);
      }

      this.KillAllWaitingSounds();
    }
  }

  KillAllWaitingSounds() {
    if (this.waitingInterval) {
      clearInterval(this.waitingInterval);
      this.waitingInterval = null;
    }
    if (this.waitingSoundOverride) {
      clearTimeout(this.waitingSoundOverride);
      this.waitingSoundOverride = null;
    }
  }

  InitChatMessage() {
    const LLMName = window.resources.GetString(window.constants.LLMModel);
    this.firstTime = false;
    this.DisplayChatMessage(
      LLMName,
      window.resources.GetString("processing"),
      true
    );
    const defaultPrompt = this.GetDefaultPrompt();
    this.Submit(defaultPrompt, true);
  }

  ProcessLLMResponse(data: any, model: string) {
    this.WaitingSound(false);
    console.log("LLM response: ", data);
    let text = "";
    const LLMName = window.resources.GetString(model);

    if (model === "openai") {
      text = data.choices[0].message.content;
      const i = this.requestJson.messages.length;
      this.requestJson.messages[i] = {};
      this.requestJson.messages[i].role = "assistant";
      this.requestJson.messages[i].content = text;

      if (data.error) {
        this.DisplayChatMessage(LLMName, "Error processing request.", true);
        this.WaitingSound(false);
      } else {
        this.DisplayChatMessage(LLMName, text);
      }
    } else if (model === "gemini") {
      if (data.text()) {
        text = data.text();
        this.DisplayChatMessage(LLMName, text);
      } else {
        if (!data.error) {
          data.error = "Error processing request.";
          this.WaitingSound(false);
        }
      }
      if (data.error) {
        this.DisplayChatMessage(LLMName, "Error processing request.", true);
        this.WaitingSound(false);
      } else {
        // todo: display actual response
      }
    }
  }

  fakeLLMResponseData() {
    let responseText;
    if (this.requestJson.messages.length > 2) {
      responseText = {
        id: "chatcmpl-8Y44iRCRrohYbAqm8rfBbJqTUADC7",
        object: "chat.completion",
        created: 1703129508,
        model: "gpt-4-1106-vision-preview",
        usage: {
          prompt_tokens: 451,
          completion_tokens: 16,
          total_tokens: 467,
        },
        choices: [
          {
            message: {
              role: "assistant",
              content: "A fake response from the LLM. Nice.",
            },
            finish_reason: "length",
            index: 0,
          },
        ],
      };
    } else {
      responseText = {
        id: "chatcmpl-8Y44iRCRrohYbAqm8rfBbJqTUADC7",
        object: "chat.completion",
        created: 1703129508,
        model: "gpt-4-1106-vision-preview",
        usage: {
          prompt_tokens: 451,
          completion_tokens: 16,
          total_tokens: 467,
        },
        choices: [
          {
            message: {
              role: "assistant",
              content:
                "The chart you're referring to is a bar graph titled \"The Number of Diamonds",
            },
            finish_reason: "length",
            index: 0,
          },
        ],
      };
    }

    return responseText;
  }

  OpenAIPrompt(text: string, img: string | null = null) {
    const url = "https://api.openai.com/v1/chat/completions";
    const auth = window.constants.openAIAuthKey;
    const requestJson = this.OpenAIJson(text, img);
    console.log("LLM request: ", requestJson);

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth,
      },
      body: JSON.stringify(requestJson),
    })
      .then((response) => response.json())
      .then((data) => {
        this.ProcessLLMResponse(data, "openai");
      })
      .catch((error) => {
        this.WaitingSound(false);
        console.error("Error:", error);
        this.DisplayChatMessage("OpenAI", "Error processing request.", true);
      });
  }

  OpenAIJson(text: string, img: string | null = null) {
    let sysMessage = window.constants.LLMSystemMessage;
    const backupMessage =
      "Describe " + window.maidr!.type + " charts to a blind person";
    if (!this.requestJson) {
      this.requestJson = {
        model: "gpt-4o",
        max_tokens: window.constants.LLMmaxResponseTokens,
        messages: [
          {
            role: "system",
            content: sysMessage,
          },
        ],
      };
    }

    const i = this.requestJson.messages.length;
    this.requestJson.messages[i] = {
      role: "user",
      content: img
        ? [
            {
              type: "text",
              text,
            },
            {
              type: "image_url",
              image_url: { url: img },
            },
          ]
        : text,
    };

    return this.requestJson;
  }
  DisplayChatMessage(user = "User", text = "", isSystem = false) {
    const hLevel = "h3";
    const multiAIName = window.resources.GetString("multi");
    const titleHtml = `
      <div class="chatLLM_message chatLLM_message_other">
        <h3 class="chatLLM_message_user">${multiAIName} Responses</h3>
      </div>
    `;
    const html = `
      <div class="chatLLM_message ${
        user === "User" ? "chatLLM_message_self" : "chatLLM_message_other"
      }">
      ${
        text !== window.resources.GetString("processing")
          ? `<${hLevel} class="chatLLM_message_user">${user}</${hLevel}>`
          : ""
      }
      <p class="chatLLM_message_text">${text}</p>
      </div>
      ${
        user !== "User" && text !== window.resources.GetString("processing")
          ? `<p class="chatLLM_message_copy"><button class="chatLLM_message_copy_button">Copy</button></p>`
          : ""
      }
    `;

    this.RenderChatMessage(html);
  }

  RenderChatMessage(html: string) {
    document
      .getElementById("chatLLM_chat_history")!
      .insertAdjacentHTML("beforeend", html);
    (document.getElementById("chatLLM_input") as HTMLInputElement).value = "";

    document.getElementById("chatLLM_chat_history")!.scrollTop =
      document.getElementById("chatLLM_chat_history")!.scrollHeight;
  }

  ResetLLM() {
    document.getElementById("chatLLM_chat_history")!.innerHTML = "";

    this.requestJson = null;
    this.firstTime = true;

    if (window.constants.autoInitLLM || this.shown) {
      this.InitChatMessage();
    }
  }

  Destroy() {
    const chatLLM = document.getElementById("chatLLM");
    if (chatLLM) {
      chatLLM.remove();
    }
    const backdrop = document.getElementById("chatLLM_modal_backdrop");
    if (backdrop) {
      backdrop.remove();
    }
  }

  Toggle(onoff?: boolean) {
    if (typeof onoff === "undefined") {
      onoff = document.getElementById("chatLLM")!.classList.contains("hidden");
    }
    this.shown = onoff;
    if (onoff) {
      this.whereWasMyFocus = document.activeElement as HTMLElement;
      this.tabMovement = 0;
      document.getElementById("chatLLM")!.classList.remove("hidden");
      document
        .getElementById("chatLLM_modal_backdrop")!
        .classList.remove("hidden");
      // document.querySelector('#chatLLM .close')!.focus();

      if (this.firstTime) {
        this.InitChatMessage();
      }
    } else {
      document.getElementById("chatLLM")!.classList.add("hidden");
      document
        .getElementById("chatLLM_modal_backdrop")!
        .classList.add("hidden");
      this.whereWasMyFocus!.focus();
      this.whereWasMyFocus = null;
      this.firstOpen = true;
    }
  }

  async ConvertSVGtoJPG(id: string, model: string) {
    const svgElement = document.getElementById(id)!;
    return new Promise<string>((resolve, reject) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;

      let svgData = new XMLSerializer().serializeToString(svgElement);
      if (!svgData.startsWith("<svg xmlns")) {
        svgData = `<svg xmlns="http://www.w3.org/2000/svg" ${svgData.slice(4)}`;
      }

      const svgSize =
        (svgElement as unknown as SVGMarkerElement).viewBox.baseVal ||
        svgElement.getBoundingClientRect();
      canvas.width = svgSize.width;
      canvas.height = svgSize.height;

      const img = new Image();
      img.onload = function () {
        ctx.drawImage(img, 0, 0, svgSize.width, svgSize.height);
        const jpegData = canvas.toDataURL("image/jpeg", 0.9);
        if (model === "openai") {
          resolve(jpegData);
        } else if (model === "gemini") {
          const base64Data = jpegData.split(",")[1];
          resolve(base64Data);
        }
        URL.revokeObjectURL(url);
      };

      img.onerror = function () {
        reject(new Error("Error loading SVG"));
      };

      const svgBlob = new Blob([svgData], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(svgBlob);
      img.src = url;
    });
  }

  GetDefaultPrompt() {
    let text = "Describe this chart to a blind person";
    let constants = window.constants;
    let singleMaidr = window.maidr;
    if (window.constants.skillLevel) {
      if (
        window.constants.skillLevel === "other" &&
        window.constants.skillLevelOther
      ) {
        text +=
          " who has a " +
          window.constants.skillLevelOther +
          " understanding of statistical charts. ";
      } else {
        text +=
          " who has a " +
          window.constants.skillLevel +
          " understanding of statistical charts. ";
      }
    } else {
      text += " who has a basic understanding of statistical charts. ";
    }
    text += "Here is a chart in image format";
    if (singleMaidr) {
      text += " and raw data in json format: \n";
      text += JSON.stringify(singleMaidr);
    }

    return text;
  }
}

export class LogError {
  LogAbsentElement(a: string) {
    console.log(a, "not found. Visual highlighting is turned off.");
  }

  LogCriticalElement(a: string) {
    console.log(a, "is critical. MAIDR unable to run");
  }

  LogDifferentLengths(a: any, b: any) {
    console.log(
      a,
      "and",
      b,
      "do not have the same length. Visual highlighting is turned off."
    );
  }
}