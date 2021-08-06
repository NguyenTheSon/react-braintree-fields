import React from 'react';
import PropTypes from 'prop-types';
import Braintree$1 from 'braintree-web/client';
import HostedFields from 'braintree-web/hosted-fields';
import BraintreeDataCollector from 'braintree-web/data-collector';
import BraintreeThreeDSecure from 'braintree-web/three-d-secure';

function _objectWithoutPropertiesLoose(source, excluded) {
  if (source == null) return {};
  var target = {};
  var sourceKeys = Object.keys(source);
  var key, i;

  for (i = 0; i < sourceKeys.length; i++) {
    key = sourceKeys[i];
    if (excluded.indexOf(key) >= 0) continue;
    target[key] = source[key];
  }

  return target;
}

function _objectWithoutProperties(source, excluded) {
  if (source == null) return {};

  var target = _objectWithoutPropertiesLoose(source, excluded);

  var key, i;

  if (Object.getOwnPropertySymbols) {
    var sourceSymbolKeys = Object.getOwnPropertySymbols(source);

    for (i = 0; i < sourceSymbolKeys.length; i++) {
      key = sourceSymbolKeys[i];
      if (excluded.indexOf(key) >= 0) continue;
      if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue;
      target[key] = source[key];
    }
  }

  return target;
}

function cap(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

class BraintreeClientApi {
  constructor(_ref) {
    var {
      authorization,
      styles,
      onAuthorizationSuccess
    } = _ref,
        callbacks = _objectWithoutProperties(_ref, ["authorization", "styles", "onAuthorizationSuccess"]);

    this.fields = Object.create(null);
    this._nextFieldId = 0;
    this.fieldHandlers = Object.create(null);
    this.styles = styles || {};
    this.wrapperHandlers = callbacks || {};
    this.setAuthorization(authorization, onAuthorizationSuccess);
  }

  setAuthorization(authorization, onAuthorizationSuccess) {
    if (!authorization && this.authorization) {
      this.teardown();
    } else if (authorization && authorization !== this.authorization) {
      // fields have not yet checked in, delay setting so they can register
      if (0 === Object.keys(this.fields).length && !this.pendingAuthTimer) {
        this.pendingAuthTimer = setTimeout(() => {
          this.pendingAuthTimer = null;
          this.setAuthorization(authorization, onAuthorizationSuccess);
        }, 5);
        return;
      }

      if (this.authorization) {
        this.teardown();
      }

      this.authorization = authorization;
      Braintree$1.create({
        authorization
      }, (err, clientInstance) => {
        if (err) {
          this.onError(err);
        } else {
          this.create(clientInstance, onAuthorizationSuccess);

          if (this.wrapperHandlers.threeDSecure) {
            console.log("BraintreeThreeDSecure", BraintreeThreeDSecure, clientInstance);
            BraintreeThreeDSecure.create({
              version: 2,
              // Will use 3DS2 whenever possible
              client: clientInstance
            }, this.wrapperHandlers.threeDSecure);
          }

          if (this.wrapperHandlers.onDataCollectorInstanceReady) {
            BraintreeDataCollector.create({
              client: clientInstance,
              kount: true
            }, this.wrapperHandlers.onDataCollectorInstanceReady);
          }
        }
      });
    }
  }

  nextFieldId() {
    this._nextFieldId += 1;
    return this._nextFieldId;
  }

  onError(err) {
    if (!err) {
      return;
    }

    if (this.wrapperHandlers.onError) {
      this.wrapperHandlers.onError(err);
    }
  }

  create(client, onAuthorizationSuccess) {
    this.client = client;
    HostedFields.create({
      client,
      styles: this.styles,
      fields: this.fields
    }, (err, hostedFields) => {
      if (err) {
        this.onError(err);
        return;
      }

      this.hostedFields = hostedFields;
      ['blur', 'focus', 'empty', 'notEmpty', 'cardTypeChange', 'validityChange'].forEach(eventName => {
        hostedFields.on(eventName, ev => this.onFieldEvent("on".concat(cap(eventName)), ev));
      });
      this.onError(err);

      if (onAuthorizationSuccess) {
        onAuthorizationSuccess();
      }
    });
  }

  teardown() {
    if (this.hostedFields) {
      this.hostedFields.teardown();
    }

    if (this.pendingAuthTimer) {
      clearTimeout(this.pendingAuthTimer);
      this.pendingAuthTimer = null;
    }
  }

  checkInField(_ref2) {
    var {
      formatInput,
      maxlength,
      minlength,
      placeholder,
      select,
      type,
      prefill,
      id = "braintree-field-wrapper-".concat(this.nextFieldId()),
      rejectUnsupportedCards
    } = _ref2,
        handlers = _objectWithoutProperties(_ref2, ["formatInput", "maxlength", "minlength", "placeholder", "select", "type", "prefill", "id", "rejectUnsupportedCards"]);

    var onRenderComplete = () => {
      this.fieldHandlers[type] = handlers;
      this.fields[type] = {
        formatInput,
        maxlength,
        minlength,
        placeholder,
        select,
        prefill,
        selector: "#".concat(id)
      };

      if ('number' === type && rejectUnsupportedCards) {
        this.fields.number.rejectUnsupportedCards = true;
      }
    };

    return [id, onRenderComplete];
  }

  focusField(fieldType, cb) {
    this.hostedFields.focus(fieldType, cb);
  }

  clearField(fieldType, cb) {
    this.hostedFields.clear(fieldType, cb);
  }

  setAttribute(fieldType, name, value) {
    this.hostedFields.setAttribute({
      field: fieldType,
      attribute: name,
      value
    });
  }

  onFieldEvent(eventName, event) {
    var fieldHandlers = this.fieldHandlers[event.emittedBy];

    if (fieldHandlers && fieldHandlers[eventName]) {
      fieldHandlers[eventName](event.fields[event.emittedBy], event);
    }

    if (this.wrapperHandlers[eventName]) {
      this.wrapperHandlers[eventName](event);
    }
  }

  tokenize() {
    var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
    return new Promise((resolve, reject) => {
      // eslint-disable-line no-undef
      this.hostedFields.tokenize(options, (err, payload) => {
        if (err) {
          this.onError(err);
          reject(err);
        } else {
          resolve(payload);
        }
      });
    });
  }

}

class Braintree extends React.Component {
  constructor(props) {
    super(props);
    this.api = new BraintreeClientApi(props);
  }

  componentDidMount() {
    this.api.setAuthorization(this.props.authorization, this.props.onAuthorizationSuccess);

    if (this.props.getTokenRef) {
      this.props.getTokenRef(this.api.tokenize.bind(this.api));
    }
  }

  componentWillUnmount() {
    this.api.teardown();
  }

  componentDidUpdate() {
    this.api.setAuthorization(this.props.authorization, this.props.onAuthorizationSuccess);
  }

  tokenize(options) {
    return this.api.tokenize(options);
  }

  getChildContext() {
    return {
      braintreeApi: this.api
    };
  }

  render() {
    var {
      className: providedClass,
      tagName: Tag
    } = this.props;
    var className = 'braintree-hosted-fields-wrapper';

    if (providedClass) {
      className += " ".concat(providedClass);
    }

    return /*#__PURE__*/React.createElement(Tag, {
      className: className
    }, this.props.children);
  }

}
Braintree.propTypes = {
  children: PropTypes.node.isRequired,
  onAuthorizationSuccess: PropTypes.func,
  authorization: PropTypes.string,
  getTokenRef: PropTypes.func,
  onValidityChange: PropTypes.func,
  onCardTypeChange: PropTypes.func,
  onError: PropTypes.func,
  styles: PropTypes.object,
  className: PropTypes.string,
  tagName: PropTypes.string
};
Braintree.defaultProps = {
  tagName: 'div'
};
Braintree.childContextTypes = {
  braintreeApi: PropTypes.instanceOf(BraintreeClientApi)
};

class BraintreeHostedField extends React.Component {
  constructor() {
    super(...arguments);
    this.state = {};
  }

  focus() {
    this.context.braintreeApi.focusField(this.props.type);
  }

  clear() {
    this.context.braintreeApi.clearField(this.props.type);
  }

  setPlaceholder(text) {
    this.context.braintreeApi.setAttribute(this.props.type, 'placeholder', text);
  }

  componentDidMount() {
    var [fieldId, onRenderComplete] = this.context.braintreeApi.checkInField(this.props);
    this.setState({
      fieldId
    }, onRenderComplete);
  }

  get className() {
    var list = ['braintree-hosted-field'];

    if (this.props.className) {
      list.push(this.props.className);
    }

    return list.join(' ');
  }

  render() {
    var {
      fieldId
    } = this.state;

    if (!fieldId) {
      return null;
    }

    return /*#__PURE__*/React.createElement("div", {
      id: fieldId,
      className: this.className
    });
  }

}
BraintreeHostedField.propTypes = {
  type: PropTypes.oneOf(['number', 'expirationDate', 'expirationMonth', 'expirationYear', 'cvv', 'postalCode', 'cardholderName']).isRequired,
  id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  placeholder: PropTypes.string,
  className: PropTypes.string,
  onCardTypeChange: PropTypes.func,
  onValidityChange: PropTypes.func,
  onNotEmpty: PropTypes.func,
  onFocus: PropTypes.func,
  onEmpty: PropTypes.func,
  onBlur: PropTypes.func,
  prefill: PropTypes.string
};
BraintreeHostedField.contextTypes = {
  braintreeApi: PropTypes.instanceOf(BraintreeClientApi)
};

export { Braintree, BraintreeHostedField as HostedField };
//# sourceMappingURL=build.module.js.map
