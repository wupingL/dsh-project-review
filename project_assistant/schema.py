from __future__ import annotations


class SchemaValidationError(ValueError):
    """Raised when a model response is valid JSON but not valid against its schema."""


def _type_name(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def _matches_type(value, expected):
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "string":
        return isinstance(value, str)
    if expected == "array":
        return isinstance(value, list)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "null":
        return value is None
    return True


def validate_json(value, schema, path="$"):
    """Validate the JSON-Schema subset used by this controller.

    The controller only relies on object/array/string/integer/number/boolean,
    properties, required, additionalProperties, items, enum, minimum,
    maximum, minItems, maxItems, minLength and maxLength.  This keeps the
    validation local and deterministic for every model backend.
    """
    if not isinstance(schema, dict):
        raise SchemaValidationError(f"{path}: schema must be an object")
    expected = schema.get("type")
    if expected and not _matches_type(value, expected):
        raise SchemaValidationError(
            f"{path}: expected {expected}, got {_type_name(value)}")
    if "enum" in schema and value not in schema["enum"]:
        raise SchemaValidationError(
            f"{path}: value {value!r} is not one of {schema['enum']!r}")
    if "const" in schema and value != schema["const"]:
        raise SchemaValidationError(f"{path}: value does not match const")
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            raise SchemaValidationError(f"{path}: string is too short")
        if "maxLength" in schema and len(value) > schema["maxLength"]:
            raise SchemaValidationError(f"{path}: string is too long")
        return
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise SchemaValidationError(f"{path}: number is below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise SchemaValidationError(f"{path}: number is above maximum")
        return
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0):
            raise SchemaValidationError(f"{path}: array has too few items")
        if "maxItems" in schema and len(value) > schema["maxItems"]:
            raise SchemaValidationError(f"{path}: array has too many items")
        items = schema.get("items")
        if isinstance(items, dict):
            for index, item in enumerate(value):
                validate_json(item, items, f"{path}[{index}]")
        return
    if isinstance(value, dict):
        required = schema.get("required", [])
        for name in required:
            if name not in value:
                raise SchemaValidationError(f"{path}: missing required property {name!r}")
        properties = schema.get("properties", {})
        for name, item in value.items():
            if name in properties:
                validate_json(item, properties[name], f"{path}.{name}")
                continue
            extra = schema.get("additionalProperties", True)
            if extra is False:
                raise SchemaValidationError(f"{path}: unexpected property {name!r}")
            if isinstance(extra, dict):
                validate_json(item, extra, f"{path}.{name}")
