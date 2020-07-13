import { render, createElement, Fragment } from 'rax';
import { Navigation, TabBar } from 'rax-pwa';
import { useRouter } from 'rax-use-router';
import { isWeb, isMiniApp, isWeChatMiniProgram, isByteDanceMicroApp } from 'universal-env';
import UniversalDriver from 'driver-universal';
import { createMemoryHistory, createHashHistory, createBrowserHistory } from 'history';
import pathRedirect from './pathRedirect';
import { emit } from './common/appCycles';
import createApp from './common/createApp';

const INITIAL_DATA_FROM_SSR = '__INITIAL_DATA__';
const initialDataFromSSR = global[INITIAL_DATA_FROM_SSR];

// eslint-disable-next-line
const DEFAULE_ROOT_ID = document.getElementById('root');

let history;
let driver = UniversalDriver;

export function getHistory() {
  return history;
}

function _isNullableComponent(component) {
  return !component || Array.isArray(component) && component.length === 0;
}

function _matchInitialComponent(fullpath, routes) {
  let initialComponent = null;
  for (let i = 0, l = routes.length; i < l; i++) {
    if (fullpath === routes[i].path || routes[i].regexp && routes[i].regexp.test(fullpath)) {
      initialComponent = routes[i].component;
      if (typeof initialComponent === 'function') initialComponent = initialComponent();
      break;
    }
  }

  return Promise.resolve(initialComponent);
}

function App(props) {
  const { appConfig, history, routes, pageProps, InitialComponent } = props;
  const { component } = useRouter(() => ({ history, routes, InitialComponent }));
  // Return null directly if not matched
  if (_isNullableComponent(component)) return null;

  // TODO
  // if (isSSR) {}

  if (isWeb) {
    return createElement(
      Navigation,
      Object.assign(
        { appConfig, component, history, location: history.location, routes, InitialComponent },
        pageProps
      )
    );
  }

  return createElement(
    Fragment,
    {},
    createElement(component, Object.assign({ history, location: history.location, routes, InitialComponent }, pageProps)),
    createElement(TabBar, { history, config: appConfig.tabBar })
  );
}

function runApp(staticConfig, dynamicConfig = {}) {
  // Set history
  if (typeof staticConfig.history !== 'undefined') {
    history = staticConfig.history;
  } else if (initialDataFromSSR) {
    // If that contains `initialDataFromSSR`, which means SSR is enabled,
    // we should use browser history to make it works.
    history = createBrowserHistory();
  } else if (isWeb) {
    history = createHashHistory();
  } else {
    // In other situation use memory history.
    history = createMemoryHistory();
  }

  // Set custom driver
  if (typeof staticConfig.driver !== 'undefined') {
    driver = staticConfig.driver;
  }

  const { routes } = staticConfig;
  // Like https://xxx.com?_path=/page1, use `_path` to jump to a specific route.
  pathRedirect(history, routes);

  const options = { isMiniApp, isWeChatMiniProgram, isByteDanceMicroApp };
  const { runtime, pageProps } = createApp(staticConfig, dynamicConfig, options);

  let _initialComponent;
  return _matchInitialComponent(history.location.pathname, routes)
    .then(initialComponent => {
      _initialComponent = initialComponent;
      const props = {
        appConfig: staticConfig,
        history,
        routes,
        pageProps,
        InitialComponent: _initialComponent
      };

      const AppProvider = runtime.composeAppProvider();
      const RootComponent = () => {
        if (AppProvider) {
          return (
            <AppProvider><App {...props}/></AppProvider>
          );
        }
        return <App {...props}/>;
      };

      const appInstance = createElement(RootComponent, { ...props });

      // TODO：
      // if (shell) { }

      // Emit app launch cycle
      emit('launch');

      const { rootId = DEFAULE_ROOT_ID } = staticConfig;
      if (isWeb && rootId === null) console.warn('Error: Can not find #root element, please check which exists in DOM.');

      return render(
        appInstance,
        rootId,
        { driver }
      );
    });
}


export default runApp;

