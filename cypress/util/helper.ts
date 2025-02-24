import type { Maidr } from '@model/grammar';
import { TestConstants } from '../util/constant';

export function verifyPlotLoaded(plotId: string): void {
  cy.get(TestConstants.SVG + TestConstants.HASH + plotId).should('exist');
}

export function verifyMaidrActivated(plotId: string): void {
  cy.get(TestConstants.HASH + plotId).click();
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.focused().should(TestConstants.HAVE_ATTR, TestConstants.HTML_ID, plotId);
}

export function verifyLeftToRightMovement(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();

  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
  }
}

export function verifyRightToLeftMovement(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    // Move to the extreme right first.
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
    // Then move back left, with a wait after each press.
    for (let i = numBars - 1; i >= 0; i--) {
      cy.realPress(TestConstants.LEFT_ARROW_KEY);
      cy.wait(TestConstants.ONE_MILLISECOND);
    }
  }
}

export function verifyToggleTextMode(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_TERSE).should(TestConstants.SHOULD_EXIST);

  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_OFF).should(TestConstants.SHOULD_EXIST);

  cy.realPress(TestConstants.TEXT_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.TEXT_MODE_VERBOSE).should(TestConstants.SHOULD_EXIST);
}

export function verifyToggleBrailleMode(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.BRAILLE_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.realPress(TestConstants.RIGHT_ARROW_KEY);
  cy.realPress(TestConstants.BRAILLE_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.BRAILLE_MODE_ON).should(TestConstants.SHOULD_EXIST);
  cy.realPress(TestConstants.BRAILLE_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.BRAILLE_MODE_OFF).should(TestConstants.SHOULD_EXIST);
}

export function verifyToggleSonification(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.SOUND_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SOUND_MODE_OFF).should(TestConstants.SHOULD_EXIST);
  cy.realPress(TestConstants.SOUND_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SOUND_MODE_ON).should(TestConstants.SHOULD_EXIST);
}

export function verifyIncreaseSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.PERIOD_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_UP).should(TestConstants.SHOULD_EXIST);
}

export function verifyDecreaseSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.COMMA_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_DOWN).should(TestConstants.SHOULD_EXIST);
}

export function verifyResetSpeed(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress(TestConstants.SLASH_KEY);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.contains(TestConstants.SPEED_RESET).should(TestConstants.SHOULD_EXIST);
}

export function verifyAutoplay(maidrData: Maidr, elementId: string, direction: 'left-to-right' | 'right-to-left'): void {
  cy.get(TestConstants.HASH + elementId).click();
  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    if (direction === 'left-to-right') {
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY, TestConstants.RIGHT_ARROW_KEY]);
    } else if (direction === 'right-to-left') {
      for (let i = 0; i < numBars; i++) {
        cy.realPress(TestConstants.RIGHT_ARROW_KEY);
      }
      cy.realPress([TestConstants.META_KEY, TestConstants.SHIFT_KEY, TestConstants.LEFT_ARROW_KEY]);
    }
    cy.wait(numBars * TestConstants.HALF_SECOND);
  }
}

export function verifyExtremePoint(elementId: string, direction: 'left' | 'right'): void {
  cy.get(TestConstants.HASH + elementId).click();
  if (direction === 'left') {
    cy.realPress([TestConstants.META_KEY, TestConstants.LEFT_ARROW_KEY]);
    // TODO: Add validation for extreme left point
  } else if (direction === 'right') {
    cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
    // TODO: Add validation for extreme right point
  }
}

export function verifyReplaySamePoint(elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  cy.realPress([TestConstants.META_KEY, TestConstants.RIGHT_ARROW_KEY]);
  cy.wait(TestConstants.ONE_MILLISECOND);
  cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + elementId} ${TestConstants.PARAGRAPH}`)
    .invoke(TestConstants.INVOKE_TEXT)
    .then((text) => {
      const pointData = text;
      cy.realPress(TestConstants.SPACE_KEY);
      cy.get(`#${TestConstants.MAIDR_INFO_CONTAINER + elementId} ${TestConstants.PARAGRAPH}`)
        .invoke(TestConstants.INVOKE_TEXT)
        .then((text) => {
          expect(text).to.equal(pointData);
        });
    });
  // TODO: Add validation for replaying the same point
}

export function verifyBrailleNavigationForward(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  // Move to the right to induce braille
  cy.realPress(TestConstants.RIGHT_ARROW_KEY);
  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    cy.realPress(TestConstants.BRAILLE_KEY);
    cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + elementId);
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
  }
}

export function verifyBrailleNavigationReverse(maidrData: Maidr, elementId: string): void {
  cy.get(TestConstants.HASH + elementId).click();
  // Move to the right to induce braille
  cy.realPress(TestConstants.RIGHT_ARROW_KEY);
  if (Array.isArray(maidrData.data)) {
    const numBars = maidrData.data.length;
    cy.realPress(TestConstants.BRAILLE_KEY);
    cy.focused().should(TestConstants.HAVE_ID, TestConstants.BRAILLE_TEXTAREA + elementId);
    for (let i = 0; i < numBars; i++) {
      cy.realPress(TestConstants.RIGHT_ARROW_KEY);
    }
    for (let i = numBars - 1; i >= 0; i--) {
      cy.realPress(TestConstants.LEFT_ARROW_KEY);
    }
  }
}
