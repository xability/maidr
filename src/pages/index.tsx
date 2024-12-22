import React, {useEffect, useState} from 'react';
import {DefaultKey} from '../core/manager/keymap';
import HelpMenu from './HelpMenu';
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
    }
    return <></>;
  };

  return <div>{renderComponent(component)}</div>;
};

export default ReactMicroFrontend;
