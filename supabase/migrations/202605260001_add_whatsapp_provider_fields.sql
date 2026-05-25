-- Add provider support for WhatsApp instances (Evolution API and UazAPI)

-- Add provider field (default to EVOLUTION for existing instances)
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS provider varchar(20) NOT NULL DEFAULT 'EVOLUTION';

-- Add UazAPI configuration fields
ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS uazapi_base_url text;

ALTER TABLE public.whatsapp_instances 
ADD COLUMN IF NOT EXISTS uazapi_token text;

-- Make evolution fields nullable since UazAPI instances won't use them
ALTER TABLE public.whatsapp_instances 
ALTER COLUMN evolution_base_url DROP NOT NULL;

ALTER TABLE public.whatsapp_instances 
ALTER COLUMN evolution_api_key DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN public.whatsapp_instances.provider IS 'WhatsApp provider: EVOLUTION or UAZAPI';
COMMENT ON COLUMN public.whatsapp_instances.uazapi_base_url IS 'UazAPI base URL (only for UAZAPI provider)';
COMMENT ON COLUMN public.whatsapp_instances.uazapi_token IS 'UazAPI authentication token (only for UAZAPI provider)';
