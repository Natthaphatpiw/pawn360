# Responses

OpenAI's most advanced interface for generating model responses. Supports text and image inputs, and text outputs. Create stateful interactions with the model, using the output of previous responses as input. Extend the model's capabilities with built-in tools for file search, web search, computer use, and more. Allow the model access to external systems and data using function calling.

# Create a model response

```
POST https://api.openai.com/v1/responses
```

นี่คือเนื้อหาจากรูปภาพที่คุณแนบมา โดยแปลงให้อยู่ในรูปแบบ **Markdown** ครับ

---

## Request body

**background** `boolean` `Optional` `Defaults to false`
Whether to run the model response in the background. [Learn more](https://www.google.com/search?q=%23).

---

**conversation** `string` or `object` `Optional` `Defaults to null`

The conversation that this response belongs to. Items from this conversation are prepended to `input_items` for this response request. Input items and output items from this response are automatically added to this conversation after this response completes.

> Show possible types

---

**include** `array` `Optional`

Specify additional output data to include in the model response. Currently supported values are:

* `web_search_call.action.sources` : Include the sources of the web search tool call.
* `code_interpreter_call.outputs` : Includes the outputs of python code execution in code interpreter tool call items.
* `computer_call_output.output.image_url` : Include image urls from the computer call output.
* `file_search_call.results` : Include the search results of the file search tool call.
* `message.input_image.image_url` : Include image urls from the input message.
* `message.output_text.logprobs` : Include logprobs with assistant messages.
* `reasoning.encrypted_content` : Includes an encrypted version of reasoning tokens in reasoning item outputs. This enables reasoning items to be used in multi-turn conversations when using the Responses API statelessly (like when the `store` parameter is set to `false`, or when an organization is enrolled in the zero data retention program).

---

**instructions** `string` `Optional`

When using along with `previous_response_id`, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses.

---

**max_output_tokens** `integer` `Optional`

An upper bound for the number of tokens that can be generated for a response, including visible output tokens and reasoning tokens.

---

**parallel_tool_calls** `boolean` `Optional` `Defaults to true`

Whether to allow the model to run tool calls in parallel.

---

**previous_response_id** `string` `Optional`

The unique ID of the previous response to the model. Use this to create multi-turn conversations. Learn more about conversation state. Cannot be used in conjunction with `conversation`.

---

**prompt** `object` `Optional`

Reference to a prompt template and its variables.

- id `string` `Required`
The unique identifier of the prompt template to use.

- variables `map` `Optional`
Optional map of values to substitute in for variables in your prompt. The substitution values can either be strings, or other Response input types like images or files.

- version `string` `Optional`
Optional version of the prompt template.

---

**reasoning** `object` `Optional`

gpt-5 and o-series models only

- effort `string` `Optional` `Defaults to medium` 
Constrains effort on reasoning for reasoning models. Currently supported values are none, minimal, low, medium, high, and xhigh. Reducing reasoning effort can result in faster responses and fewer tokens used on reasoning in a response.
    - gpt-5.1 defaults to none, which does not perform reasoning. The supported reasoning values for gpt-5.1 are none, low, medium, and high. Tool calls are supported for all reasoning values in gpt-5.1.
    - All models before gpt-5.1 default to medium reasoning effort, and do not support none.
    - The gpt-5-pro model defaults to (and only supports) high reasoning effort.
    - xhigh is supported for all models after gpt-5.1-codex-max.

---

**temperature** `number` `Optional` `Defaults to 1`

What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. We generally recommend altering this or `top_p` but not both.

---

**tool_choice** `string or object` `Optional`

How the model should select which tool (or tools) to use when generating a response. See the tools parameter to see how to specify which `tools` the model can call.

- Tool choice mode `string`
Controls which (if any) tool is called by the model.
    - none means the model will not call any tool and instead generates a message.
    - auto means the model can pick between generating a message or calling one or more tools.
    - required means the model must call one or more tools.

- Allowed tools `object`
Constrains the tools available to the model to a pre-defined set.

- Hosted tool `object`
Indicates that the model should use a built-in tool to generate a response. [Learn more about built-in tools.](https://platform.openai.com/docs/guides/tools)

- Function tool `object`
Use this option to force the model to call a specific function.
    - name `string` `Required`
The name of the function to call.
    - type `string` `Required`
For function calling, the type is always function.

---

**tools** `array` `Optional`

An array of tools the model may call while generating a response. You can specify which tool to use by setting the tool_choice parameter.

We support the following categories of tools:

- Built-in tools: Tools that are provided by OpenAI that extend the model's capabilities, like web search or file search. Learn more about built-in tools.
- MCP Tools: Integrations with third-party systems via custom MCP servers or predefined connectors such as Google Drive and SharePoint. Learn more about MCP Tools.
- Function calls (custom tools): Functions that are defined by you, enabling the model to call your own code with strongly typed arguments and outputs. Learn more about function calling. You can also use custom tools to call your own code.

นี่คือเนื้อหาจากรูปภาพที่สองที่คุณส่งมา (รายละเอียดของ **Web search object**) ในรูปแบบ Markdown ครับ

---

### **Web search** `object`

Search the Internet for sources related to the prompt. [Learn more about the web search tool](https://www.google.com/search?q=%23).

---

**type** `string` `Required`
The type of the web search tool. One of `web_search` or `web_search_2025_08_26`.

---

**filters** `object` `Optional`
Filters for the search.

- allowed_domains `array`

Optional
Defaults to []
Allowed domains for the search. If not provided, all domains are allowed. Subdomains of the provided domains are allowed as well.

Example: ["pubmed.ncbi.nlm.nih.gov"]

---

**search_context_size** `string` `Optional` `Defaults to medium`
High level guidance for the amount of context window space to use for the search. One of `low`, `medium`, or `high`. `medium` is the default.

---

**user_location** `object` `Optional`
The approximate location of the user.

* **city** `string` `Optional`
Free text input for the city of the user, e.g. `San Francisco`.
* **country** `string` `Optional`
The two-letter [ISO country code](https://www.google.com/search?q=%23) of the user, e.g. `US`.
* **region** `string` `Optional`
Free text input for the region of the user, e.g. `California`.
* **timezone** `string` `Optional`
The [IANA timezone](https://www.google.com/search?q=%23) of the user, e.g. `America/Los_Angeles`.
* **type** `string` `Optional` `Defaults to approximate`
The type of location approximation. Always `approximate`.

---




> Example request

```js
import OpenAI from "openai";

const openai = new OpenAI();

const response = await openai.responses.create({
    model: "gpt-4.1",
    tools: [{ type: "web_search_preview" }],
    input: "What was a positive news story from today?",
});

console.log(response);
```

> Response

```json
{
  "id": "resp_67ccf18ef5fc8190b16dbee19bc54e5f087bb177ab789d5c",
  "object": "response",
  "created_at": 1741484430,
  "status": "completed",
  "error": null,
  "incomplete_details": null,
  "instructions": null,
  "max_output_tokens": null,
  "model": "gpt-4.1-2025-04-14",
  "output": [
    {
      "type": "web_search_call",
      "id": "ws_67ccf18f64008190a39b619f4c8455ef087bb177ab789d5c",
      "status": "completed"
    },
    {
      "type": "message",
      "id": "msg_67ccf190ca3881909d433c50b1f6357e087bb177ab789d5c",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "As of today, March 9, 2025, one notable positive news story...",
          "annotations": [
            {
              "type": "url_citation",
              "start_index": 442,
              "end_index": 557,
              "url": "https://.../?utm_source=chatgpt.com",
              "title": "..."
            },
            {
              "type": "url_citation",
              "start_index": 962,
              "end_index": 1077,
              "url": "https://.../?utm_source=chatgpt.com",
              "title": "..."
            },
            {
              "type": "url_citation",
              "start_index": 1336,
              "end_index": 1451,
              "url": "https://.../?utm_source=chatgpt.com",
              "title": "..."
            }
          ]
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "reasoning": {
    "effort": null,
    "summary": null
  },
  "store": true,
  "temperature": 1.0,
  "text": {
    "format": {
      "type": "text"
    }
  },
  "tool_choice": "auto",
  "tools": [
    {
      "type": "web_search_preview",
      "domains": [],
      "search_context_size": "medium",
      "user_location": {
        "type": "approximate",
        "city": null,
        "country": "US",
        "region": null,
        "timezone": null
      }
    }
  ],
  "top_p": 1.0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 328,
    "input_tokens_details": {
      "cached_tokens": 0
    },
    "output_tokens": 356,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 684
  },
  "user": null,
  "metadata": {}
}
```

Web search
==========

Allow models to search the web for the latest information before generating a response.

Web search allows models to access up-to-date information from the internet and provide answers with sourced citations. To enable this, use the web search tool in the Responses API or, in some cases, Chat Completions.

There are three main types of web search available with OpenAI models:

1.  Non‑reasoning web search: The non-reasoning model sends the user’s query to the web search tool, which returns the response based on top results. There’s no internal planning and the model simply passes along the search tool’s responses. This method is fast and ideal for quick lookups.
2.  Agentic search with reasoning models is an approach where the model actively manages the search process. It can perform web searches as part of its chain of thought, analyze results, and decide whether to keep searching. This flexibility makes agentic search well suited to complex workflows, but it also means searches take longer than quick lookups. For example, you can adjust GPT-5’s reasoning level to change both the depth and latency of the search.
3.  Deep research is a specialized, agent-driven method for in-depth, extended investigations by reasoning models. The model conducts web searches as part of its chain of thought, often tapping into hundreds of sources. Deep research can run for several minutes and is best used with background mode. These tasks typically use models like `o3-deep-research`, `o4-mini-deep-research`, or `gpt-5` with reasoning level set to `high`.

Using the [Responses API](/docs/api-reference/responses), you can enable web search by configuring it in the `tools` array in an API request to generate content. Like any other tool, the model can choose to search the web or not based on the content of the input prompt.

Web search tool example

```js
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
    model: "gpt-5",
    tools: [
        { type: "web_search" },
    ],
    input: "What was a positive news story from today?",
});

console.log(response.output_text);
```

```js
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="gpt-5",
    tools=[{"type": "web_search"}],
    input="What was a positive news story from today?"
)

print(response.output_text)
```

```
curl "https://api.openai.com/v1/responses" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d '{
        "model": "gpt-5",
        "tools": [{"type": "web_search"}],
        "input": "what was a positive news story from today?"
    }'
```

```
using OpenAI.Responses;

string key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
OpenAIResponseClient client = new(model: "gpt-5", apiKey: key);

ResponseCreationOptions options = new();
options.Tools.Add(ResponseTool.CreateWebSearchTool());

OpenAIResponse response = (OpenAIResponse)client.CreateResponse([
    ResponseItem.CreateUserMessageItem([
        ResponseContentPart.CreateInputTextPart("What was a positive news story from today?"),
    ]),
], options);

Console.WriteLine(response.GetOutputText());
```

Output and citations
--------------------

Model responses that use the web search tool will include two parts:

*   A `web_search_call` output item with the ID of the search call, along with the action taken in `web_search_call.action`. The action is one of:
    *   `search`, which represents a web search. It will usually (but not always) includes the search `query` and `domains` which were searched. Search actions incur a tool call cost (see [pricing](/docs/pricing#built-in-tools)).
    *   `open_page`, which represents a page being opened. Supported in reasoning models.
    *   `find_in_page`, which represents searching within a page. Supported in reasoning models.
*   A `message` output item containing:
    *   The text result in `message.content[0].text`
    *   Annotations `message.content[0].annotations` for the cited URLs

By default, the model's response will include inline citations for URLs found in the web search results. In addition to this, the `url_citation` annotation object will contain the URL, title and location of the cited source.

When displaying web results or information contained in web results to end users, inline citations must be made clearly visible and clickable in your user interface.

```
[
    {
        "type": "web_search_call",
        "id": "ws_67c9fa0502748190b7dd390736892e100be649c1a5ff9609",
        "status": "completed"
    },
    {
        "id": "msg_67c9fa077e288190af08fdffda2e34f20be649c1a5ff9609",
        "type": "message",
        "status": "completed",
        "role": "assistant",
        "content": [
            {
                "type": "output_text",
                "text": "On March 6, 2025, several news...",
                "annotations": [
                    {
                        "type": "url_citation",
                        "start_index": 2606,
                        "end_index": 2758,
                        "url": "https://...",
                        "title": "Title..."
                    }
                ]
            }
        ]
    }
]
```

Domain filtering
----------------

Domain filtering in web search lets you limit results to a specific set of domains. With the `filters` parameter you can set an allow-list of up to 100 URLs. When formatting URLs, omit the HTTP or HTTPS prefix. For example, use `openai.com` instead of `https://openai.com/`. This approach also includes subdomains in the search. Note that domain filtering is only available in the Responses API with the `web_search` tool.

Sources
-------

To view all URLs retrieved during a web search, use the `sources` field. Unlike inline citations, which show only the most relevant references, sources returns the complete list of URLs the model consulted when forming its response. The number of sources is often greater than the number of citations. Real-time third-party feeds are also surfaced here and are labeled as `oai-sports`, `oai-weather`, or `oai-finance`. The sources field is available with both the `web_search` and `web_search_preview` tools.

List sources

```
curl "https://api.openai.com/v1/responses" \
-H "Content-Type: application/json" \
-H "Authorization: Bearer $OPENAI_API_KEY" \
-d '{
  "model": "gpt-5",
  "reasoning": { "effort": "low" },
  "tools": [
    {
      "type": "web_search",
      "filters": {
        "allowed_domains": [
          "pubmed.ncbi.nlm.nih.gov",
          "clinicaltrials.gov",
          "www.who.int",
          "www.cdc.gov",
          "www.fda.gov"
        ]
      }
    }
  ],
  "tool_choice": "auto",
  "include": ["web_search_call.action.sources"],
  "input": "Please perform a web search on how semaglutide is used in the treatment of diabetes."
}'
```

```
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5",
  reasoning: { effort: "low" },
  tools: [
      {
          type: "web_search",
          filters: {
              allowed_domains: [
                  "pubmed.ncbi.nlm.nih.gov",
                  "clinicaltrials.gov",
                  "www.who.int",
                  "www.cdc.gov",
                  "www.fda.gov",
              ],
          },
      },
  ],
  tool_choice: "auto",
  include: ["web_search_call.action.sources"],
  input: "Please perform a web search on how semaglutide is used in the treatment of diabetes.",
});

console.log(response.output_text);
```

```
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
  model="gpt-5",
  reasoning={"effort": "low"},
  tools=[
      {
          "type": "web_search",
          "filters": {
              "allowed_domains": [
                  "pubmed.ncbi.nlm.nih.gov",
                  "clinicaltrials.gov",
                  "www.who.int",
                  "www.cdc.gov",
                  "www.fda.gov",
              ]
          },
      }
  ],
  tool_choice="auto",
  include=["web_search_call.action.sources"],
  input="Please perform a web search on how semaglutide is used in the treatment of diabetes.",
)

print(response.output_text)
```

User location
-------------

To refine search results based on geography, you can specify an approximate user location using country, city, region, and/or timezone.

*   The `city` and `region` fields are free text strings, like `Minneapolis` and `Minnesota` respectively.
*   The `country` field is a two-letter [ISO country code](https://en.wikipedia.org/wiki/ISO_3166-1), like `US`.
*   The `timezone` field is an [IANA timezone](https://timeapi.io/documentation/iana-timezones) like `America/Chicago`.

Note that user location is not supported for deep research models using web search.

Customizing user location

```
from openai import OpenAI
client = OpenAI()

response = client.responses.create(
    model="o4-mini",
    tools=[{
        "type": "web_search",
        "user_location": {
            "type": "approximate",
            "country": "GB",
            "city": "London",
            "region": "London",
        }
    }],
    input="What are the best restaurants near me?",
)

print(response.output_text)
```

```
using OpenAI.Responses;

string key = Environment.GetEnvironmentVariable("OPENAI_API_KEY")!;
OpenAIResponseClient client = new(model: "gpt-5", apiKey: key);

ResponseCreationOptions options = new();
options.Tools.Add(ResponseTool.CreateWebSearchTool(
    userLocation: WebSearchToolLocation.CreateApproximateLocation(
        country: "GB",
        city: "London",
        region: "Granary Square"
    )
));

OpenAIResponse response = (OpenAIResponse)client.CreateResponse([
    ResponseItem.CreateUserMessageItem([
        ResponseContentPart.CreateInputTextPart(
            "What are the best restaurants near me?"
        )
    ])
], options);

Console.WriteLine(response.GetOutputText());
```

```
import OpenAI from "openai";
const openai = new OpenAI();

const response = await openai.responses.create({
    model: "o4-mini",
    tools: [{
        type: "web_search",
        user_location: {
            type: "approximate",
            country: "GB",
            city: "London",
            region: "London"
        }
    }],
    input: "What are the best restaurants near me?",
});
console.log(response.output_text);
```

```
curl "https://api.openai.com/v1/responses" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $OPENAI_API_KEY" \
    -d '{
        "model": "o4-mini",
        "tools": [{
            "type": "web_search",
            "user_location": {
                "type": "approximate",
                "country": "GB",
                "city": "London",
                "region": "London"
            }
        }],
        "input": "What are the best restaurants near me?"
    }'
```

Live internet access
--------------------

Control whether the web search tool fetches live content or uses only cached/indexed results in the Responses API.

*   Set `external_web_access: false` on the `web_search` tool to run in offline/cache‑only mode.
*   Default is `true` (live access) if you do not set it.
*   Preview variants (`web_search_preview`) ignore this parameter and behave as if `external_web_access` is `true`.

Control live internet access

```
curl "https://api.openai.com/v1/responses" -H "Content-Type: application/json" -H "Authorization: Bearer $OPENAI_API_KEY" -d '{
  "model": "gpt-5",
  "tools": [
    { "type": "web_search", "external_web_access": false }
  ],
  "tool_choice": "auto",
  "input": "Find the sunrise time in Paris today and cite the source."
}'
```

```
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
model: "gpt-5",
tools: [
  { type: "web_search", external_web_access: false },
],
tool_choice: "auto",
input: "Find the sunrise time in Paris today and cite the source.",
});

console.log(response.output_text);
```

```
from openai import OpenAI
client = OpenAI()

resp = client.responses.create(
  model="gpt-5",
  tools=[{ "type": "web_search", "external_web_access": False }],
  tool_choice="auto",
  input="Find the sunrise time in Paris today and cite the source.",
)
print(resp.output_text)
```

API compatibility
-----------------

Web search is available in the Responses API as the generally available version of the tool, `web_search`, as well as the earlier tool version, `web_search_preview`. To use web search in the Chat Completions API, use the specialized web search models `gpt-5-search-api`, `gpt-4o-search-preview` and `gpt-4o-mini-search-preview`.

Limitations
-----------

*   Web search is currently not supported in [`gpt-5`](/docs/models/gpt-5) with `minimal` reasoning, and [`gpt-4.1-nano`](/docs/models/gpt-4.1-nano).
*   When used as a tool in the [Responses API](/docs/api-reference/responses), web search has the same tiered rate limits as the models above.
*   Web search is limited to a context window size of 128000 (even with [`gpt-4.1`](/docs/models/gpt-4.1) and [`gpt-4.1-mini`](/docs/models/gpt-4.1-mini) models).

Usage notes
-----------

||
|ResponsesChat CompletionsAssistants|Same as tiered rate limits for underlying model used with the tool.|PricingZDR and data residency|

