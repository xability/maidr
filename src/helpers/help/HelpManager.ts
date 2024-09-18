// import { Constants } from "../../constants";
// import menuTemplateHtml from './menutemplate.html';

// // migrated userSettings interface from constants.js. These fields are specific to the help menu and hence they have been declared here
// interface UserSettings {
//     vol: number;
//     autoPlayRate: number;
//     brailleDisplayLength: number;
//     colorSelected: string;
//     keypressInterval: number;
//     ariaMode: string;
//     openAIAuthKey?: string;
//     geminiAuthKey: string;
//     skillLevel: string;
//     skillLevelOther: string;
//     LLMModel: string;
//     LLMPreferences: string;
//     LLMOpenAiMulti: boolean;
//     LLMGeminiMulti: boolean;
//     autoInitLLM: boolean;
// }

// export class HelpManager {
//     whereWasMyFocus: any | null = null;
//     constants: Constants;
//     userSettings: Partial<UserSettings> = {};
//     userSettingsKeys: (keyof UserSettings)[] = [
//         "vol",
//         "autoPlayRate",
//         "brailleDisplayLength",
//         "colorSelected",
//         "keypressInterval",
//         "ariaMode",
//         "openAIAuthKey",
//         "geminiAuthKey",
//         "skillLevel",
//         "skillLevelOther",
//         "LLMModel",
//         "LLMPreferences",
//         "LLMOpenAiMulti",
//         "LLMGeminiMulti",
//         "autoInitLLM",
//     ];
    
//     constructor() {
//         this.constants = window.constants;
//         this.CreateMenu();
//         this.LoadDataFromLocalStorage();
        
//     }

//     // The HTML code defined in menuHTML has been moved to a separate file called MenuTemplate.html. processTemplate method is used to replace the constants in the template with the actual values.
//     processTemplate(template: string) : string {
//         return template
//             .replace(/\$\{constants\.control\}/g, this.constants.control)
//             .replace(/\$\{constants\.home\}/g, this.constants.home)
//             .replace(/\$\{constants\.end\}/g, this.constants.end)
//             .replace(/\$\{constants\.alt\}/g, this.constants.alt)
//             .replace(/\$\{constants\.isMac \? constants\.alt : constants\.control\}/g, 
//                 this.constants.isMac ? this.constants.alt : this.constants.control);
//     }

//     // The custom toggle function used for relevant menu elements. The function is used to toggle the visibility of the menu and chat elements.
//     Toggle(onoff: boolean = false): void {
//         const menu = document.getElementById('menu');
//         const chatLLM = document.getElementById('chatLLM');
//         const menuModalBackdrop = document.getElementById('menu_modal_backdrop');
    
//         if (onoff === undefined) {
//           onoff = menu?.classList.contains('hidden') ?? false;
//         }
//         if (onoff && chatLLM && !chatLLM.classList.contains('hidden')) {
//           return;
//         }
    
//         if (onoff) {
//           this.whereWasMyFocus = document.activeElement as HTMLElement;
//           this.PopulateData();
//           this.constants.tabMovement = 0;
//           menu?.classList.remove('hidden');
//           menuModalBackdrop?.classList.remove('hidden');
//           (document.querySelector('#menu .close') as HTMLElement)?.focus();
//         } else {
//           menu?.classList.add('hidden');
//           menuModalBackdrop?.classList.add('hidden');
//           this.whereWasMyFocus?.focus();
//           this.whereWasMyFocus = null;
//         }
//     }

//     CreateMenu(): void {
//         const menuhtml = this.processTemplate(menuTemplateHtml);
//         const container = document.getElementById('menu-container');
//         if (container) {
//             container.innerHTML = menuhtml;
//         }
//         this.setupCloseButtons();
//         this.setupSaveAndCloseButton();
//         this.setupMenuEscapeListener();
//         this.MenuOpenListener();
//         this.addLLMModelChangeListener();
//         this.setupSkillLevelChangeListener();
//         this.setupLLMResetListeners();
//     }

//     // Menu close events

//     setupCloseButtons(): void {
//         const allCloseButtons = document.querySelectorAll('#close_menu, #menu .close');
//         allCloseButtons.forEach((closeButton) => {
//             if (closeButton instanceof HTMLElement) {
//                 const closeEvent = (e: Event) => {
//                     this.Toggle(false);
//                 };
//                 closeButton.addEventListener('click', closeEvent);
//                 this.constants.events.push([closeButton, 'click', closeEvent]);
//             }
//         });
//     }

//     setupSaveAndCloseButton(): void {
//         const saveAndCloseButton = document.getElementById('save_and_close_menu');
//         if (saveAndCloseButton instanceof HTMLElement) {
//             const saveAndCloseEvent = (e: Event) => {
//                 this.SaveData();
//                 this.Toggle(false);
//             };
//             saveAndCloseButton.addEventListener('click', saveAndCloseEvent);
//             this.constants.events.push([saveAndCloseButton, 'click', saveAndCloseEvent]);
//         }
//     }

//     setupMenuEscapeListener(): void {
//         const menuElement = document.getElementById('menu');
//         if (menuElement instanceof HTMLElement) {
//             const escapeEvent = (e: KeyboardEvent) => {
//                 if (e.key === 'Escape') {
//                     this.Toggle(false);
//                 }
//             };
//             menuElement.addEventListener('keyup', escapeEvent);
//             this.constants.events.push([menuElement, 'keyup', escapeEvent]);
//         }
//     }

//     // events to handle the press of 'h' key to open the menu.

//     MenuOpenListener(): void {
//         const handleKeyUp = (e: KeyboardEvent): void => {
//           const target = e.target as HTMLElement;
//           if (target.tagName.toLowerCase() === 'input' || target.tagName.toLowerCase() === 'textarea') {
//             return;
//           }
          
//           if (e.key === 'h') {
//             this.Toggle(true);
//           }
//         };
    
//         document.addEventListener('keyup', handleKeyUp);
//         this.constants.events.push([document, 'keyup', handleKeyUp]);
//     }

//     // event listener to handle the change in the LLM model

//     addLLMModelChangeListener(): void {
//         const llmModelSelect = document.getElementById('LLM_model') as HTMLSelectElement | null;
//         if (!llmModelSelect) return;
    
//         const handleLLMModelChange = (e: Event): void => {
//           const target = e.target as HTMLSelectElement;
//           const value = target.value;
    
//           const elements = {
//             openaiAuthKey: document.getElementById('openai_auth_key_container'),
//             geminiAuthKey: document.getElementById('gemini_auth_key_container'),
//             openaiMulti: document.getElementById('openai_multi_container'),
//             geminiMulti: document.getElementById('gemini_multi_container'),
//             openaiMultiCheckbox: document.getElementById('openai_multi') as HTMLInputElement | null,
//             geminiMultiCheckbox: document.getElementById('gemini_multi') as HTMLInputElement | null
//           };
    
//           const setVisibility = (element: HTMLElement | null, isVisible: boolean) => {
//             if (element) {
//               element.classList.toggle('hidden', !isVisible);
//             }
//           };
    
//           const setCheckboxState = (checkbox: HTMLInputElement | null, isChecked: boolean) => {
//             if (checkbox) {
//               checkbox.checked = isChecked;
//             }
//           };
    
//           switch (value) {
//             case 'openai':
//               setVisibility(elements.openaiAuthKey, true);
//               setVisibility(elements.geminiAuthKey, false);
//               setVisibility(elements.openaiMulti, false);
//               setVisibility(elements.geminiMulti, false);
//               setCheckboxState(elements.openaiMultiCheckbox, true);
//               setCheckboxState(elements.geminiMultiCheckbox, false);
//               break;
//             case 'gemini':
//               setVisibility(elements.openaiAuthKey, false);
//               setVisibility(elements.geminiAuthKey, true);
//               setVisibility(elements.openaiMulti, false);
//               setVisibility(elements.geminiMulti, false);
//               setCheckboxState(elements.openaiMultiCheckbox, false);
//               setCheckboxState(elements.geminiMultiCheckbox, true);
//               break;
//             case 'multi':
//               setVisibility(elements.openaiAuthKey, true);
//               setVisibility(elements.geminiAuthKey, true);
//               setVisibility(elements.openaiMulti, true);
//               setVisibility(elements.geminiMulti, true);
//               setCheckboxState(elements.openaiMultiCheckbox, true);
//               setCheckboxState(elements.geminiMultiCheckbox, true);
//               break;
//           }
//         };
    
//         llmModelSelect.addEventListener('change', handleLLMModelChange);
//         this.constants.events.push([llmModelSelect, 'change', handleLLMModelChange]);
//     }

//     // event listener to handle the change in the skill level

//     setupSkillLevelChangeListener(): void {
//         const skillLevelSelect = document.getElementById('skill_level') as HTMLSelectElement | null;
//         const skillLevelOtherContainer = document.getElementById('skill_level_other_container');

//         if (!skillLevelSelect || !skillLevelOtherContainer) {
//             console.warn('Skill level elements not found');
//             return;
//         }

//         const handleSkillLevelChange = (e: Event): void => {
//             const target = e.target as HTMLSelectElement;
//             skillLevelOtherContainer.classList.toggle('hidden', target.value !== 'other');
//         };

//         skillLevelSelect.addEventListener('change', handleSkillLevelChange);
//         this.constants.events.push([skillLevelSelect, 'change', handleSkillLevelChange]);
//     }

//     // Events to handle reset of active LLM conversations.

//     setupLLMResetListeners(): void {
//         const LLMResetIds = [
//             'LLM_model',
//             'openai_multi',
//             'gemini_multi',
//             'skill_level',
//             'LLM_preferences',
//         ];

//         const notifyOfLLMReset = (e: Event): void => {
//             this.NotifyOfLLMReset();
//         };

//         LLMResetIds.forEach(id => {
//             const element = document.getElementById(id);
//             if (element) {
//                 element.addEventListener('change', notifyOfLLMReset);
//                 this.constants.events.push([element, 'change', notifyOfLLMReset]);
//             } else {
//                 console.warn(`Element with id '${id}' not found for LLM reset notification.`);
//             }
//         });
//     }

//     LoadDataFromLocalStorage() {
//         const storedData = localStorage.getItem('settings_data');
//         const data: Partial<UserSettings> = storedData ? JSON.parse(storedData) : {};
        
//         if (Object.keys(data).length > 0) {
//             this.userSettingsKeys.forEach((key) => {
//                 if (key in data) {
//                     this.userSettings[key] = data[key as keyof UserSettings];
//                     (this.constants as any)[key] = data[key as keyof UserSettings];
//                 }
//             });
//         }

//         if ('MIN_FREQUENCY' in data) {
//             this.constants.MIN_FREQUENCY = data.MIN_FREQUENCY as number;
//         }

//         if ('MAX_FREQUENCY' in data) {
//         this.constants.MAX_FREQUENCY = data.MAX_FREQUENCY as number;
//         }

//         this.PopulateData();
//         this.UpdateHtml();
//     }
    
//     PopulateData() {
//         const setValue = (id: string, value: any) => {
//             const element = document.getElementById(id) as HTMLInputElement | null;
//             if (element && value !== undefined) {
//                 element.value = value.toString();
//             }
//         };

//         setValue('vol', this.userSettings.vol);
//         setValue('autoPlayRate', this.userSettings.autoPlayRate);
//         setValue('colorSelected', this.userSettings.colorSelected);
//         setValue('MIN_FREQUENCY', this.constants.MIN_FREQUENCY);
//         setValue('MAX_FREQUENCY', this.constants.MAX_FREQUENCY);
//         setValue('keypressInterval', this.userSettings.keypressInterval);
//         if (typeof this.userSettings.openAIAuthKey === 'string') {
//             setValue('openAIAuthKey', this.userSettings.openAIAuthKey);
//         }
//         if (typeof this.userSettings.geminiAuthKey === 'string') {
//             setValue('geminiAuthKey', this.userSettings.geminiAuthKey);
//         }
//         setValue('skillLevel', this.userSettings.skillLevel);
//         if(this.userSettings.skillLevelOther) {
//             setValue('skillLevelOther', this.userSettings.skillLevelOther);
//         }
//         setValue('LLMModel', this.userSettings.LLMModel);
//         this.SetAriaMode();
//         this.setLLMConfigurations();

//     }

//     SetAriaMode(){
//         const ariaAssertive = document.getElementById('aria_mode_assertive') as HTMLInputElement | null;
//         const ariaPolite = document.getElementById('aria_mode_polite') as HTMLInputElement | null;
//         if (ariaAssertive && ariaPolite) {
//             if (this.constants.ariaMode === 'assertive') {
//             ariaAssertive.checked = true;
//             ariaPolite.checked = false;
//             } else {
//             ariaPolite.checked = true;
//             ariaAssertive.checked = false;
//             }
//         }
//     }

//     setLLMConfigurations() {
//         const toggleVisibility = (id: string, show: boolean) => {
//           const element = document.getElementById(id);
//           if (element) {
//             element.classList.toggle('hidden', !show);
//           }
//         };
      
//         const setCheckboxState = (id: string, checked: boolean) => {
//           const checkbox = document.getElementById(id) as HTMLInputElement | null;
//           if (checkbox) {
//             checkbox.checked = checked;
//           }
//         };

//         const setValue = (id: string, value: any) => {
//             const element = document.getElementById(id) as HTMLInputElement | null;
//             if (element && value !== undefined) {
//               element.value = value.toString();
//             }
//         };
      
//         const openaiVisible = this.constants.LLMModel === 'openai' || this.constants.LLMModel === 'multi';
//         const geminiVisible = this.constants.LLMModel === 'gemini' || this.constants.LLMModel === 'multi';
//         const multiVisible = this.constants.LLMModel === 'multi';
      
//         toggleVisibility('openai_auth_key_container', openaiVisible);
//         toggleVisibility('gemini_auth_key_container', geminiVisible);
//         toggleVisibility('openai_multi_container', multiVisible);
//         toggleVisibility('gemini_multi_container', multiVisible);
      
//         if (multiVisible) {
//             setCheckboxState('openai_multi', this.userSettings.LLMOpenAiMulti ?? false);
//             setCheckboxState('gemini_multi', this.userSettings.LLMGeminiMulti ?? false);
//         }

//         toggleVisibility('skill_level_other_container', this.constants.skillLevel === 'other');
//         if (this.userSettings.LLMPreferences) {
//             setValue('LLM_preferences', this.userSettings.LLMPreferences);
//         }
//         const resetNotification = document.getElementById('LLM_reset_notification');
//         if (resetNotification) {
//             resetNotification.remove();
//         }
//     }

//     NotifyOfLLMReset(): void {
//         const notificationHtml = '<p id="LLM_reset_notification">Note: Changes in LLM settings will reset any existing conversation.</p>';
//         const existingNotification = document.getElementById('LLM_reset_notification');
//         const saveAndCloseButton = document.getElementById('save_and_close_menu');

//         if (existingNotification) {
//             existingNotification.remove();
//         }

//         if (saveAndCloseButton) {
//             saveAndCloseButton.insertAdjacentHTML('afterend', notificationHtml);
//             const currentLabelledBy = saveAndCloseButton.getAttribute('aria-labelledby') || '';
//             const newLabelledBy = currentLabelledBy
//                 ? `${currentLabelledBy} LLM_reset_notification`
//                 : 'save_and_close_text LLM_reset_notification';
//             saveAndCloseButton.setAttribute('aria-labelledby', newLabelledBy);
//         } else {
//             console.warn('Save and close button not found for LLM reset notification.');
//         }
//     }

//     UpdateHtml(): void {
//         this.updateAriaAttributes();
//         this.updateAutoInitLLM();
//         this.updateHighlightColors();
//     }

//     // This method updates Aria Attributes.
//     updateAriaAttributes(): void {
//         const { infoDiv, announcement_container_id, ariaMode } = this.constants;
//         if (infoDiv instanceof HTMLElement) {
//             infoDiv.setAttribute('aria-live', ariaMode);
//         }
//         const announcementContainer = document.getElementById(announcement_container_id);
//         if (announcementContainer) {
//             announcementContainer.setAttribute('aria-live', ariaMode);
//         }
//     }

//     // This method 
//     updateAutoInitLLM(): void {
//         const initLLMCheckbox = document.getElementById('init_llm_on_load') as HTMLInputElement | null;
//         if (initLLMCheckbox) {
//             initLLMCheckbox.checked = this.constants.autoInitLLM;
//         }
//     }

//     // This method updates the highlight colors for scatter points, heatmap and line.
//     // Need to confirm how to utilize plot type to check whether the plot is of type  scatter points, heatmap or line
//     updateHighlightColors(): void {
//         const { colorSelected } = this.constants;
//         const scatterPoints = document.getElementsByClassName('highlight_point');
//         Array.from(scatterPoints).forEach(point => {
//             if (point instanceof SVGElement) {
//                 point.setAttribute('stroke', colorSelected);
//                 point.setAttribute('fill', colorSelected);
//             }
//         });
//         const heatmap = document.getElementById('highlight_rect');
//         if (heatmap instanceof SVGElement) {
//             heatmap.setAttribute('stroke', colorSelected);
//         }
//         const line = document.getElementById('highlight_point');
//         if (line instanceof SVGElement) {
//             line.setAttribute('stroke', colorSelected);
//         }
//     }

//     SaveData() {
//         const shouldReset = this.ShouldLLMReset();

//         this.updateConstantsFromInputs();
//         this.updateAriaMode();

//         this.SaveDataToLocalStorage();
//         this.UpdateHtml();

//         if (shouldReset && this.chatLLM) {
//             this.chatLLM.ResetLLM();
//         }
//     }
    
//     updateConstantsFromInputs(): void {
//         const inputMappings: { [key: string]: keyof Constants } = {
//             'vol': 'vol',
//             'autoplay_rate': 'autoPlayRate',
//             'braille_display_length': 'brailleDisplayLength',
//             'color_selected': 'colorSelected',
//             'min_freq': 'MIN_FREQUENCY',
//             'max_freq': 'MAX_FREQUENCY',
//             'keypress_interval': 'keypressInterval',
//             'openai_auth_key': 'openAIAuthKey',
//             'gemini_auth_key': 'geminiAuthKey',
//             'skill_level': 'skillLevel',
//             'skill_level_other': 'skillLevelOther',
//             'LLM_model': 'LLMModel',
//             'LLM_preferences': 'LLMPreferences',
//         };

//         Object.entries(inputMappings).forEach(([elementId, constantKey]) => {
//             const element = document.getElementById(elementId) as HTMLInputElement;
//             if (element) {
//                 (this.constants[constantKey] as string) = element.value;
//             }
//         });

//         const checkboxMappings: { [key: string]: keyof Constants } = {
//             'openai_multi': 'LLMOpenAiMulti',
//             'gemini_multi': 'LLMGeminiMulti',
//             'init_llm_on_load': 'autoInitLLM',
//         };

//         Object.entries(checkboxMappings).forEach(([elementId, constantKey]) => {
//             const element = document.getElementById(elementId) as HTMLInputElement;
//             if (element) {
//                 (this.constants[constantKey] as boolean) = element.checked;
//             }
//         });
//     }

//     updateAriaMode(): void {
//         const assertiveRadio = document.getElementById('aria_mode_assertive') as HTMLInputElement;
//         const politeRadio = document.getElementById('aria_mode_polite') as HTMLInputElement;

//         if (assertiveRadio?.checked) {
//             this.constants.ariaMode = 'assertive';
//         } else if (politeRadio?.checked) {
//             this.constants.ariaMode = 'polite';
//         }
//     }

//     ShouldLLMReset(): boolean {
//         const checkValues: [keyof Constants, string][] = [
//             ['skillLevel', 'skill_level'],
//             ['LLMPreferences', 'LLM_preferences'],
//             ['LLMModel', 'LLM_model'],
//         ];
//         for (const [constantKey, elementId] of checkValues) {
//             const element = document.getElementById(elementId) as HTMLInputElement;
//             if (element && this.constants[constantKey] !== element.value) {
//                 return true;
//             }
//         }
//         const checkboxValues: [keyof Constants, string][] = [
//             ['LLMOpenAiMulti', 'openai_multi'],
//             ['LLMGeminiMulti', 'gemini_multi'],
//         ];

//         for (const [constantKey, elementId] of checkboxValues) {
//             const element = document.getElementById(elementId) as HTMLInputElement;
//             if (element && this.constants[constantKey] !== element.checked) {
//                 return true;
//             }
//         }

//         return false;
//     }

//     Destroy() {
//         let menu = document.getElementById('menu');
//         if (menu) {
//           menu.remove();
//         }
//         let backdrop = document.getElementById('menu_modal_backdrop');
//         if (backdrop) {
//           backdrop.remove();
//         }
//     }

// }