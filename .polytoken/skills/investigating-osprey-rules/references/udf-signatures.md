# UDF Signatures Reference (Static Fallback)

> **STALENESS WARNING:** This file is a point-in-time snapshot of UDF signatures
> extracted from the osprey-for-atproto repository. It may be outdated. When
> possible, the investigator uses dynamic discovery (reading Python source
> directly) for accurate, current signatures.
>
> Last generated: 2026-02-21

## How to Read This Table

- **Parameters** column lists argument name, type, and default (if any)
- **Returns** column shows the return type
- **Source** column shows the file path relative to `plugins_atproto/src/`
- UDFs inherit from `UDFBase[ArgumentsClass, ReturnType]`
- Arguments inherit from `ArgumentsBase` (or a subclass of it)

---

## Standard UDFs

### Text Processing

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `TextContains` | `s: str`, `phrase: str`, `case_sensitive: bool = False` | `bool` | `udfs/std/text.py` |
| `ForceString` | `s: Optional[str]` | `str` | `udfs/std/text.py` |
| `ExtractDomains` | `s: str` | `List[str]` | `udfs/std/text.py` |
| `ExtractEmoji` | `s: str` | `List[str]` | `udfs/std/text.py` |
| `Tokenize` | `s: str`, `skip_censor_chars: bool = False`, `skip_regex: Optional[str] = None` | `List[str]` | `udfs/std/tokenize.py` |
| `CleanString` | `s: str`, `zero_width: bool = True`, `underlines: bool = True`, `space_likes: bool = False`, `single_quotes: bool = False` | `str` | `udfs/std/censorize.py` |
| `CheckCensorized` | `s: str`, `pattern: str`, `plurals: bool = False`, `substrings: bool = False`, `must_be_censorized: bool = False` | `bool` | `udfs/std/censorize.py` |

### List Matching

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `ListContains` | `list: str`, `phrases: List[Optional[str]]`, `case_sensitive: bool = False`, `word_boundaries: bool = True` | `Optional[str]` | `udfs/std/list.py` |
| `SimpleListContains` | `cache_name: str`, `list: List[str]`, `phrases: List[Optional[str]]`, `case_sensitive: bool = False`, `word_boundaries: bool = True` | `Optional[str]` | `udfs/std/list.py` |
| `RegexListMatch` | `list: str`, `phrases: List[str]`, `case_sensitive: bool = False` | `Optional[str]` | `udfs/std/list.py` |
| `CensorizedListMatch` | `list: str`, `phrases: List[str]`, `plurals: bool = False`, `substrings: bool = False` | `Optional[str]` | `udfs/std/list.py` |

### Cache Operations

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `CacheGetStr` | `key: str`, `when_all: List[bool]`, `default: str = ''` | `str` | `udfs/std/cache.py` |
| `CacheGetInt` | `key: str`, `when_all: List[bool]`, `default: int = 0` | `int` | `udfs/std/cache.py` |
| `CacheGetFloat` | `key: str`, `when_all: List[bool]`, `default: float = 0.0` | `float` | `udfs/std/cache.py` |
| `CacheSetStr` | `key: str`, `value: str`, `when_all: List[bool]`, `ttl_seconds: float = 86400` | `None` | `udfs/std/cache.py` |
| `CacheSetInt` | `key: str`, `value: int`, `when_all: List[bool]`, `ttl_seconds: float = 86400` | `None` | `udfs/std/cache.py` |
| `CacheSetFloat` | `key: str`, `value: float`, `when_all: List[bool]`, `ttl_seconds: float = 86400` | `None` | `udfs/std/cache.py` |
| `IncrementWindow` | `key: str`, `window_seconds: float`, `when_all: List[bool]`, `max_ttl_seconds: Optional[float] = None` | `int` | `udfs/std/cache.py` |
| `GetWindowCount` | `key: str`, `window_seconds: float`, `when_all: List[bool]` | `int` | `udfs/std/cache.py` |

### Utility

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `TimestampAge` | `timestamp: str` | `float` | `udfs/std/timestamp_age.py` |
| `ConcatStringLists` | `lists: List[List[str]]`, `optional_lists: List[List[Optional[str]]] = []` | `List[str]` | `udfs/std/concat.py` |
| `Log` | `s: str`, `when_all: List[bool] = []` | `None` | `udfs/std/log.py` |

---

## AT Protocol Query UDFs

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `DidFromUri` | `uri: Optional[str]` | `Optional[str]` | `udfs/atproto/std/did_from_uri.py` |
| `GetRecordURI` | _(none — uses base ArgumentsBase)_ | `str` | `udfs/atproto/atproto.py` |
| `GetRecordCID` | _(none — uses base ArgumentsBase)_ | `str` | `udfs/atproto/atproto.py` |
| `GetDIDCreatedAt` | _(none — uses base ArgumentsBase)_ | `str` | `udfs/atproto/atproto.py` |
| `GetPDSService` | _(none — uses base ArgumentsBase)_ | `str` | `udfs/atproto/atproto.py` |
| `GetHandle` | _(none — uses base ArgumentsBase)_ | `str` | `udfs/atproto/atproto.py` |

---

## AT Protocol Effect UDFs

| UDF | Parameters | Returns | Source |
|-----|-----------|---------|--------|
| `AddAtprotoLabel` | `entity: str`, `label: str`, `comment: str`, `email: Optional[str]`, `expiration_in_hours: Optional[int]` | `AtprotoLabelEffect` | `udfs/atproto/atproto_label.py` |
| `RemoveAtprotoLabel` | `entity: str`, `label: str`, `comment: str`, `email: Optional[str]`, `expiration_in_hours: Optional[int]` | `AtprotoLabelEffect` | `udfs/atproto/atproto_label.py` |
| `AtprotoTag` | `entity: str`, `tag: str`, `comment: str`, `neg: Optional[bool] = False`, `apply_if: Optional[RuleT] = None` | `AtprotoTagEffect` | `udfs/atproto/tag.py` |
| `AtprotoAcknowledge` | `entity: str`, `comment: Optional[str]` | `AtprotoAcknowledgeEffect` | `udfs/atproto/atproto_acknowledge.py` |
| `AtprotoComment` | `entity: str`, `comment: str` | `AtprotoCommentEffect` | `udfs/atproto/atproto_comment.py` |
| `AtprotoSendEmail` | `entity: str`, `email: str`, `comment: Optional[str]` | `AtprotoEmailEffect` | `udfs/atproto/atproto_email.py` |
| `AtprotoEscalate` | `entity: str`, `comment: Optional[str]` | `AtprotoEscalateEffect` | `udfs/atproto/atproto_escalate.py` |
| `AtprotoReport` | `entity: str`, `report_kind: str`, `comment: str`, `priority_score: Optional[int] = None` | `AtprotoReportEffect` | `udfs/atproto/atproto_report.py` |
| `AddAtprotoTakedown` | `entity: str`, `comment: str`, `email: Optional[str]` | `AtprotoTakedownEffect` | `udfs/atproto/atproto_takedown.py` |
| `RemoveAtprotoTakedown` | `entity: str`, `comment: str`, `email: Optional[str]` | `AtprotoTakedownEffect` | `udfs/atproto/atproto_takedown.py` |

---

## Notes

- All UDF classes inherit from `UDFBase[ArgumentsClass, ReturnType]`
- All argument classes inherit from `ArgumentsBase` (or a subclass like `CacheArgumentsBase`)
- The `register_plugins.py` entry point is at `plugins_atproto/src/register_plugins.py`
- UDF source files live under `plugins_atproto/src/udfs/`
- Cache UDFs use `when_all: List[bool]` as a guard — they only execute when all conditions are true
- Effect UDFs (Atproto*) return custom effect dataclasses, not primitive types
- `valid_labels` for `AddAtprotoLabel`/`RemoveAtprotoLabel`: needs-review, hide, !hide, warn, !warn, porn, sexual, rude, spam, misleading
- `valid_emails` for `AtprotoSendEmail`: spam-label, spam-label-24, spam-label-72, spam-takedown, spam-fake, id-request, impersonation-label, automod-takedown, reinstatement, threat-takedown, pedo-takedown, dms-disabled, toxic-list-hide
- `valid_report_kinds` for `AtprotoReport`: spam, violation, misleading, sexual, rude, other
