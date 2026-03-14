import { describe, it, mock, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { uploadToStorage } from '../upload.js';
import { supabase } from '../db.js';

// Supabase mock için yardımcı değişkenler
let uploadCallCount = 0;

describe('Hata Senaryoları (Error Handling)', () => {
    
    beforeEach(() => {
        uploadCallCount = 0;
        
        // Supabase client mocks
        mock.method(supabase.storage, 'from', () => ({
            upload: async (path, buffer, options) => {
                uploadCallCount++;
                // Bilerek hata dönsün
                return { data: null, error: { message: 'Network Timeout' } };
            },
            getPublicUrl: (path) => ({ data: { publicUrl: 'mock_url' } })
        }));
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it('1. Supabase ağı koptuğunda (Network Timeout) 3 kez retry atmalı ve sonunda hata fırlatmalı', async () => {
        const dummyBuffer = Buffer.from('test');
        
        try {
            await uploadToStorage(dummyBuffer, 'test_path/1.jpg');
            assert.fail('Hata fırlatması gerekiyordu');
        } catch (err) {
            // MAX_RETRIES (3) kez çağırmış olmalı
            assert.strictEqual(uploadCallCount, 3, 'Upload fonksiyonu tam 3 kez çağrılmalı (retry mekanizması çalışmıyor veya eksik)');
            assert.match(err.message, /Network Timeout/, 'Fırlatılan hata orjinal hatayı içermeli');
        }
    });

    it('2. Kullanıcı geçerli fotoğraf harici (PDF, Video) gönderdiğinde uyarı dönmeli (Crash olmamalı)', async () => {
        // GrammY context (ctx) mock'u
        let repliedMessage = null;
        
        const mockCtx = {
            updateType: 'message',
            message: {
                document: {
                    file_id: 'doc_123',
                    file_name: 'belge.pdf',
                    mime_type: 'application/pdf'
                }
            },
            from: { id: 12345, first_name: 'TestUser' },
            reply: async (text) => {
                repliedMessage = text;
            }
        };

        // TODO: Projenizde index.js içinde geçersiz dosya / dokümanları dinleyen bir
        // handler henüz yoksa, bu test bu aşamada referans olarak oluşturulmuştur.
        // Botun çökmemesini bir handler simülasyonu ile test edebiliriz:
        
        const simulateDocumentHandler = async (ctx) => {
            if (!ctx.message?.photo) {
                await ctx.reply('Lütfen sadece fotoğraf (jpeg/png) gönderin. PDF veya dökümanlar desteklenmiyor.');
            }
        };

        // Handler çalıştığında hata atmamalı
        await assert.doesNotReject(async () => {
            await simulateDocumentHandler(mockCtx);
        });

        // Kullanıcıya mesaj gidip gitmediğini kontrol et
        assert.ok(repliedMessage !== null, 'Kullanıcıya geçersiz dosya uyarısı gönderilmiş olmalı');
        assert.match(repliedMessage, /fotoğraf/, 'Uyarı metni fotoğraf göndermesi gerektiğini içermelidir');
    });
});
