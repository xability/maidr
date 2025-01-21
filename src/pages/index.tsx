import React, {useEffect, useState} from 'react';
import HelpMenu from './HelpMenu';
import {GlobalSearch} from './GlobalSearch';
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

  const executeShortcut = (key: string) => {
    frontendManager.frontendManager.executeShortcut(key);
  };

  const renderComponent = (key: string | null) => {
    switch (key) {
      case 'HELP_MENU':
        return <HelpMenu />;
      case 'GLOBAL_SEARCH':
        return <GlobalSearch executeShortcut={executeShortcut} />;
    }
    return <></>;
  };

  return <div>{renderComponent(component)}</div>;
};

export default ReactMicroFrontend;
