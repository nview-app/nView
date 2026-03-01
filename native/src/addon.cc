#include <node_api.h>

#include "../include/secure_memory_types.h"

namespace {

bool ReadBufferArg(napi_env env, napi_callback_info info, uint8_t** data, size_t* length) {
  size_t argc = 1;
  napi_value argv[1];
  napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr);
  if (argc != 1) {
    napi_throw_type_error(env, nullptr, "Expected a single Buffer argument");
    return false;
  }

  bool isBuffer = false;
  napi_is_buffer(env, argv[0], &isBuffer);
  if (!isBuffer) {
    napi_throw_type_error(env, nullptr, "Argument must be a Buffer");
    return false;
  }

  void* rawData = nullptr;
  napi_get_buffer_info(env, argv[0], &rawData, length);
  *data = static_cast<uint8_t*>(rawData);
  return true;
}

napi_value CreateBool(napi_env env, bool value) {
  napi_value output;
  napi_get_boolean(env, value, &output);
  return output;
}

napi_value IsSupported(napi_env env, napi_callback_info info) {
  (void)info;
#ifdef _WIN32
  return CreateBool(env, true);
#else
  return CreateBool(env, false);
#endif
}

napi_value LockBuffer(napi_env env, napi_callback_info info) {
  uint8_t* data = nullptr;
  size_t length = 0;
  if (!ReadBufferArg(env, info, &data, &length)) {
    return nullptr;
  }

  nview::LockResult result = nview::LockBuffer(data, length);

  napi_value output;
  napi_create_object(env, &output);
  napi_set_named_property(env, output, "ok", CreateBool(env, result.ok));
  napi_set_named_property(env, output, "locked", CreateBool(env, result.locked));
  return output;
}

napi_value UnlockBuffer(napi_env env, napi_callback_info info) {
  uint8_t* data = nullptr;
  size_t length = 0;
  if (!ReadBufferArg(env, info, &data, &length)) {
    return nullptr;
  }

  nview::OpResult result = nview::UnlockBuffer(data, length);

  napi_value output;
  napi_create_object(env, &output);
  napi_set_named_property(env, output, "ok", CreateBool(env, result.ok));
  return output;
}

napi_value WipeBuffer(napi_env env, napi_callback_info info) {
  uint8_t* data = nullptr;
  size_t length = 0;
  if (!ReadBufferArg(env, info, &data, &length)) {
    return nullptr;
  }

  nview::OpResult result = nview::WipeBuffer(data, length);

  napi_value output;
  napi_create_object(env, &output);
  napi_set_named_property(env, output, "ok", CreateBool(env, result.ok));
  return output;
}

}  // namespace

NAPI_MODULE_INIT() {
  napi_property_descriptor descriptors[] = {
      {"isSupported", nullptr, IsSupported, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"lockBuffer", nullptr, LockBuffer, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"unlockBuffer", nullptr, UnlockBuffer, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"wipeBuffer", nullptr, WipeBuffer, nullptr, nullptr, nullptr, napi_default, nullptr},
  };

  napi_define_properties(env, exports, sizeof(descriptors) / sizeof(descriptors[0]), descriptors);
  return exports;
}
