import React, {useEffect, useState} from 'react';
import {HelpMenu} from './HelpMenu';
import {LLMDialog} from './LLMDialog';
import FrontendManager from '../core/manager/frontend';

interface ReactMicroFrontendProps {
  frontendManager: FrontendManager;
}

const ReactMicroFrontend: React.FC<
  ReactMicroFrontendProps
> = frontendManager => {
  const [component, setComponent] = useState<string | null>(null);

  useEffect(() => {
    frontendManager.frontendManager.setFrontendKeyMap((key: string) => {
      setComponent(key);
    });
  }, []);

  const renderComponent = (key: string | null) => {
    switch (key) {
      case 'HELP_MENU':
        return <HelpMenu />;
      case 'LLM_DIALOG':
        return <LLMDialog />;
    }
    return <></>;
  };

  return <div>{renderComponent(component)}</div>;
};

export default ReactMicroFrontend;
