import { Constants } from "../../constants";
import chatLLMTemplatehtml from "./chatLLMTemplate.html";

interface EventConfig {
    element: string;
    event: string;
    handler: string | ((e: Event) => void);
    key?: string;
    keyConditions?: string[];
}
export class ChatLLMManager {
    whereWasMyFocus: HTMLElement | null = null;
    constants: Constants;
    firstTime: boolean = true;
    firstMulti: boolean = true;
    firstOpen: boolean = true;
    shown: boolean = false;

    constructor() {
        this.constants = window.constants;
        this.firstTime = true;
        this.firstMulti = true;
        this.firstOpen = true;
        this.shown = false;
        this.CreateComponent();
        this.SetEvents();
        this.AutoInitLLM();
    }

    processTemplate(template: string): string {
        return template.replace(/\$\{constants\.ariaMode\}/g, this.constants.ariaMode);
    }

    CreateComponent(): void {
       const llmhtml = this.processTemplate(chatLLMTemplatehtml);
       document.querySelector('body')?.insertAdjacentHTML('beforeend', llmhtml);
    }

    AutoInitLLM(): void {
        if (this.constants.autoInitLLM) {
            if (
              (this.constants.LLMModel == 'openai' && this.constants.openAIAuthKey) ||
              (this.constants.LLMModel == 'gemini' && this.constants.geminiAuthKey) ||
              (this.constants.LLMModel == 'multi' &&
                this.constants.openAIAuthKey &&
                this.constants.geminiAuthKey)
            ) {
              this.InitChatMessage();
            }
        }
    }

    InitChatMessage(): void {
        let LLMName = resources.GetString(this.constants.LLMModel);
        this.firstTime = false;
        this.DisplayChatMessage(LLMName, resources.GetString('processing'), true);
        let defaultPrompt = this.GetDefaultPrompt();
        this.Submit(defaultPrompt, true);
    }
    
    SetEvents(): void {
        const eventConfigs: EventConfig[] = [
          { element: '#close_chatLLM, #chatLLM .close', event: 'click', handler: () => this.Toggle(false) },
          { element: '#chatLLM', event: 'keyup', handler: (e: KeyboardEvent) => { if (e.key === 'Escape') this.Toggle(false); } },
          { element: 'document', event: 'keyup', handler: (e: KeyboardEvent) => { if ((e.key === '?' && (e.ctrlKey || e.metaKey)) || e.key === '¿') this.Toggle(); } },
          { element: '#chatLLM_submit', event: 'click', handler: this.handleSubmit },
          { element: '#chatLLM_input', event: 'keyup', handler: (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) this.handleSubmit(e); } },
          { element: '#chatLLM .LLM_suggestions button:not(#more_suggestions)', event: 'click', handler: this.handleSuggestion },
          { element: '#delete_openai_key', event: 'click', handler: () => this.deleteKey('openai') },
          { element: '#delete_gemini_key', event: 'click', handler: () => this.deleteKey('gemini') },
          { element: '#reset_chatLLM', event: 'click', handler: this.ResetLLM },
          { element: '#chatLLM', event: 'click', handler: this.CopyChatHistory },
          { element: '#chatLLM', event: 'keyup', handler: this.CopyChatHistory }
        ];
      
        eventConfigs.forEach(this.registerEvent);
    }
      
    registerEvent(config: EventConfig): void {
        const elements = document.querySelectorAll(config.element);
        elements.forEach(element => {
          element.addEventListener(config.event, config.handler as EventListener);
        });
    }
      
    handleSubmit(e: Event): void {
        const input = document.getElementById('chatLLM_input') as HTMLInputElement;
        const text = input.value;
        this.DisplayChatMessage('User', text);
        this.Submit(text);
        input.value = '';
    }
      
    handleSuggestion(e: MouseEvent): void {
        const text = (e.target as HTMLElement).innerHTML;
        this.DisplayChatMessage('User', text);
        this.Submit(text);
    }
      
    deleteKey(provider: 'openai' | 'gemini'): void {
        (document.getElementById(`${provider}_auth_key`) as HTMLInputElement).value = '';
    }

    CopyChatHistory(e?: Event): string | void {
        let text = '';
    
        if (!e) {
          text = this.getFullChatHistory();
        } else if (e instanceof MouseEvent) {
          text = this.handleMouseEvent(e);
        } else if (e instanceof KeyboardEvent) {
          text = this.handleKeyboardEvent(e);
        }
    
        if (text === '') {
          return;
        }
    
        const markdown = this.processText(text);
        this.copyToClipboard(markdown);
        return markdown;
    }
    
    getFullChatHistory(): string {
        return document.getElementById('chatLLM_chat_history')?.innerHTML || '';
    }
    
    handleMouseEvent(e: MouseEvent): string {
        const target = e.target as HTMLElement;
        if (target.id === 'chatLLM_copy_all') {
          return this.getFullChatHistory();
        } else if (target.classList.contains('chatLLM_message_copy_button')) {
          const messageElement = target.closest('p')?.previousElementSibling as HTMLElement;
          return messageElement?.innerHTML || '';
        }
        return '';
    }
    
    handleKeyboardEvent(e: KeyboardEvent): string {
        if (e.key === 'C' && (e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey) {
          e.preventDefault();
          const lastMessage = document.querySelector('#chatLLM_chat_history > .chatLLM_message_other:last-of-type') as HTMLElement;
          return lastMessage?.innerHTML || '';
        } else if (e.key === 'A' && (e.ctrlKey || e.metaKey || e.altKey) && e.shiftKey) {
          e.preventDefault();
          return this.getFullChatHistory();
        }
        return '';
    }
    
    processText(text: string): string {
        const cleanElems = document.createElement('div');
        cleanElems.innerHTML = text;
        cleanElems.querySelectorAll('.chatLLM_message_copy').forEach(elem => elem.remove());
    
        let markdown = this.htmlToMarkdown(cleanElems);
        return markdown.replace(/\n{3,}/g, '\n\n');
    }
    
    copyToClipboard(text: string): void {
        try {
          navigator.clipboard.writeText(text);
        } catch (err) {
          console.error('Failed to copy: ', err);
        }
    }

    htmlToMarkdown(element: Node): string {
        const convertElementToMarkdown = (node: Node): string => {
          if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent?.trim() || '';
          }
    
          if (node.nodeType !== Node.ELEMENT_NODE) {
            return '';
          }
    
          const elem = node as HTMLElement;
          const tagName = elem.tagName.toUpperCase();
    
          switch (tagName) {
            case 'H1':
            case 'H2':
            case 'H3':
            case 'H4':
            case 'H5':
            case 'H6':
              return `${'#'.repeat(parseInt(tagName[1]))} ${elem.textContent}\n\n`;
            case 'P':
              return `${elem.textContent}\n\n`;
            case 'DIV':
              return Array.from(elem.childNodes)
                .map(convertElementToMarkdown)
                .join('') + '\n\n';
            default:
              return Array.from(elem.childNodes)
                .map(convertElementToMarkdown)
                .join('');
          }
        };
        return convertElementToMarkdown(element).trim();
    }

    async Submit(text: string, firsttime: boolean = false): Promise<void> {
        let img: string | null = null;
        this.firstMulti = true;
    
        if (this.shouldPrependUserPosition(firsttime)) {
          text = this.prependUserPosition(text);
          this.firstOpen = false;
        }
    
        if (this.constants.playLLMWaitingSound) {
          this.WaitingSound(true);
        }

        // how to pass Maidr object to this function?
        if (firsttime) {
          img = await this.ConvertSVGtoJPG(singleMaidr.id, this.getLLMProvider());
        }
    
        if (this.constants.LLMOpenAiMulti || this.constants.LLMModel === 'openai') {
          await this.OpenAIPrompt(text, img);
        }
    
        if (this.constants.LLMGeminiMulti || this.constants.LLMModel === 'gemini') {
          await this.GeminiPrompt(text, img);
        }
    }
    
    shouldPrependUserPosition(firsttime: boolean): boolean {
        return (
          (this.firstOpen || this.constants.LLMModel === 'gemini') &&
          !firsttime &&
          this.constants.verboseText.length > 0
        );
    }
    
    prependUserPosition(text: string): string {
        return `Here is the current position in the chart; no response necessarily needed, use this info only if it's relevant to future questions: ${this.constants.verboseText}. My question is: ${text}`;
    }
    
    getLLMProvider(): 'openai' | 'gemini' {
        return this.constants.LLMModel === 'openai' ? 'openai' : 'gemini';
    }

    // Should these values be defined as attributes of the class or kept in constants?
    KillAllWaitingSounds(): void {
        if (this.constants.waitingInterval) {
          clearInterval(this.constants.waitingInterval);
          this.constants.waitingInterval = null;
        }
    
        if (this.constants.waitingSoundOverride) {
          clearTimeout(this.constants.waitingSoundOverride);
          this.constants.waitingSoundOverride = null;
        }
    
        this.constants.waitingQueue = 0;
    }

    DisplayChatMessage(user: string = 'User', text: string = '', isSystem: boolean = false): void {
        let hLevel: 'h3' | 'h4' = 'h3';
        
        if (!isSystem && this.constants.LLMModel === 'multi' && user !== 'User') {
          if (this.firstMulti) {
            const multiAIName = resources.GetString('multi');
            const titleHtml = `
              <div class="chatLLM_message chatLLM_message_other">
                <h3 class="chatLLM_message_user">${multiAIName} Responses</h3>
              </div>
            `;
            this.RenderChatMessage(titleHtml);
            this.firstMulti = false;
          }
          hLevel = 'h4';
        }
    
        const isProcessing = text === resources.GetString('processing');
        const isUser = user === 'User';
    
        let html = `
          <div class="chatLLM_message ${isUser ? 'chatLLM_message_self' : 'chatLLM_message_other'}">
            ${!isProcessing ? `<${hLevel} class="chatLLM_message_user">${user}</${hLevel}>` : ''}
            <p class="chatLLM_message_text">${text}</p>
          </div>
        `;
    
        if (!isUser && !isProcessing) {
          html += `
            <p class="chatLLM_message_copy"><button class="chatLLM_message_copy_button">Copy</button></p>
          `;
        }
    
        this.RenderChatMessage(html);
    }

    RenderChatMessage(html: string): void {
        const chatHistory = document.getElementById('chatLLM_chat_history');
        const chatInput = document.getElementById('chatLLM_input') as HTMLInputElement;
    
        if (chatHistory) {
          chatHistory.insertAdjacentHTML('beforeend', html);
          chatHistory.scrollTop = chatHistory.scrollHeight;
        } else {
          console.error('Chat history element not found');
        }
    
        if (chatInput) {
          chatInput.value = '';
        } else {
          console.error('Chat input element not found');
        }
    }

    WaitingSound(onoff: boolean = true): void {
        const delay = 1000;
        const freq = 440;
        const inprogressFreq = freq * 2;
    
        if (onoff) {
          this.clearExistingSounds();
        } else {
          this.notifyWaitingComplete(inprogressFreq);
          if (this.constants.waitingQueue > 1) {
            this.constants.waitingQueue--;
          } else {
            this.KillAllWaitingSounds();
            return;
          }
        }
    
        if (onoff) {
          this.startNewWaitingSound(freq, delay);
          this.setAutoClearTimeout();
          this.setWaitingQueue();
        }
    }
    
    clearExistingSounds(): void {
        if (this.constants.waitingInterval) {
          clearInterval(this.constants.waitingInterval);
          this.constants.waitingInterval = null;
        }
        if (this.constants.waitingSoundOverride) {
          clearTimeout(this.constants.waitingSoundOverride);
          this.constants.waitingSoundOverride = null;
        }
    }

      // Should audio be integrated for leveraging this function?
    notifyWaitingComplete(frequency: number): void {
        if (audio && this.shown) {
          audio.playOscillator(frequency, 0.2, 0);
        }
    }
    
    startNewWaitingSound(frequency: number, delay: number): void {
        this.constants.waitingInterval = setInterval(() => {
          if (audio && this.shown) {
            audio.playOscillator(frequency, 0.2, 0);
          }
        }, delay);
    }
    
    setAutoClearTimeout(): void {
        this.constants.waitingSoundOverride = setTimeout(() => {
          this.KillAllWaitingSounds();
        }, 30000);
    }
    
    setWaitingQueue(): void {
        if (this.constants.LLMModel !== 'multi') {
          this.constants.waitingQueue = 1;
        } else {
          this.constants.waitingQueue = 0;
          if (this.constants.LLMGeminiMulti) this.constants.waitingQueue++;
          if (this.constants.LLMOpenAiMulti) this.constants.waitingQueue++;
        }
    }

    // Need to validate if requestJson is being handled correctly in context.
    ProcessLLMResponse(data: any, model: 'openai' | 'gemini'): void {
        this.WaitingSound(false);
        console.log('LLM response: ', data);
    
        const LLMName = resources.GetString(model);
    
        if (model === 'openai') {
          this.handleOpenAIResponse(data, LLMName);
        } else if (model === 'gemini') {
          this.handleGeminiResponse(data, LLMName);
        }
    
        this.trackChatHistory();
    }
    
    handleOpenAIResponse(data: any, LLMName: string): void {
        if (data.error) {
          this.displayErrorMessage(LLMName);
        } else {
          const text = data.choices[0].message.content;
          this.updateRequestJson(text);
          this.DisplayChatMessage(LLMName, text);
        }
    }
    
    handleGeminiResponse(data: any, LLMName: string): void {
        if (data.text()) {
          const text = data.text();
          this.DisplayChatMessage(LLMName, text);
        } else if (data.error) {
          this.displayErrorMessage(LLMName);
        } else {
          // TODO: display actual response
          console.log('Unhandled Gemini response');
        }
    }
    
    updateRequestJson(text: string): void {
        const i = this.requestJson.messages.length;
        this.requestJson.messages[i] = {
          role: 'assistant',
          content: text
        };
    }
    
    displayErrorMessage(LLMName: string): void {
        this.DisplayChatMessage(LLMName, 'Error processing request.', true);
        this.WaitingSound(false);
    }
    
    trackChatHistory(): void {
        if (this.constants.isTracking) {
          const chatHist = this.CopyChatHistory();
          tracker.SetData('ChatHistory', chatHist);
        }
    }

    Toggle(onoff?: boolean): void {
        if (typeof onoff === 'undefined') {
          onoff = !document.getElementById('chatLLM')?.classList.contains('hidden');
        }
    
        this.shown = onoff;
    
        if (onoff) {
          this.openChatLLM();
        } else {
          this.closeChatLLM();
        }
    }
    
    openChatLLM(): void {
        this.whereWasMyFocus = document.activeElement as HTMLElement;
        this.constants.tabMovement = 0;
    
        const chatLLMElement = document.getElementById('chatLLM');
        const modalBackdrop = document.getElementById('chatLLM_modal_backdrop');
    
        chatLLMElement?.classList.remove('hidden');
        modalBackdrop?.classList.remove('hidden');
    
        document.querySelector('#chatLLM .close')?.focus();
    
        if (this.firstTime) {
          this.InitChatMessage();
        }
    }
    
    closeChatLLM(): void {
        const chatLLMElement = document.getElementById('chatLLM');
        const modalBackdrop = document.getElementById('chatLLM_modal_backdrop');
    
        chatLLMElement?.classList.add('hidden');
        modalBackdrop?.classList.add('hidden');
    
        this.whereWasMyFocus?.focus();
        this.whereWasMyFocus = null;
        this.firstOpen = true;
    }

    ResetLLM(): void {
        this.clearChatHistory();
        this.resetData();
        this.reinitializeIfNeeded();
    }
    
    clearChatHistory(): void {
        const chatHistory = document.getElementById('chatLLM_chat_history');
        if (chatHistory) {
          chatHistory.innerHTML = '';
        } else {
          console.warn('Chat history element not found');
        }
    }
    
    resetData(): void {
        this.requestJson = null;
        this.firstTime = true;
    }
    
    reinitializeIfNeeded(): void {
        if (this.constants.autoInitLLM || this.shown) {
          this.InitChatMessage();
        }
    }

    // How to use maidr object in this function?
    GetDefaultPrompt(): string {
        let text = 'Describe this chart to a blind person';
        text += this.getSkillLevelText();
        text += 'Here is a chart in image format';
        if (singleMaidr) {
          text += ' and raw data in json format: \n';
          text += JSON.stringify(singleMaidr);
        }
    
        return text;
    }
    
    getSkillLevelText(): string {
        if (this.constants.skillLevel) {
          if (this.constants.skillLevel === 'other' && this.constants.skillLevelOther) {
            return ` who has a ${this.constants.skillLevelOther} understanding of statistical charts. `;
          } else {
            return ` who has a ${this.constants.skillLevel} understanding of statistical charts. `;
          }
        } else {
          return ' who has a basic understanding of statistical charts. ';
        }
    }

    ConvertSVGtoJPG(id: string, model: 'openai' | 'gemini'): Promise<string> {
        const svgElement = document.getElementById(id) as SVGSVGElement | null;
    
        if (!svgElement) {
          throw new Error(`SVG element with id ${id} not found`);
        }
    
        return new Promise((resolve, reject) => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
    
          if (!ctx) {
            reject(new Error('Unable to create canvas context'));
            return;
          }
    
          let svgData = new XMLSerializer().serializeToString(svgElement);
          if (!svgData.startsWith('<svg xmlns')) {
            svgData = `<svg xmlns="http://www.w3.org/2000/svg" ${svgData.slice(4)}`;
          }
    
          const svgSize = svgElement.viewBox.baseVal || svgElement.getBoundingClientRect();
          canvas.width = svgSize.width;
          canvas.height = svgSize.height;
    
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, svgSize.width, svgSize.height);
            const jpegData = canvas.toDataURL('image/jpeg', 0.9);
            
            if (model === 'openai') {
              resolve(jpegData);
            } else if (model === 'gemini') {
              const base64Data = jpegData.split(',')[1];
              resolve(base64Data);
            }
            URL.revokeObjectURL(url);
          };
    
          img.onerror = () => {
            reject(new Error('Error loading SVG'));
          };
    
          const svgBlob = new Blob([svgData], {
            type: 'image/svg+xml;charset=utf-8',
          });
          const url = URL.createObjectURL(svgBlob);
          img.src = url;
        });
      }


}