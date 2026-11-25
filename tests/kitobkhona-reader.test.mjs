import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchBookFile,readableSize,bookFilename} from '../shared/book-transfer.mjs';
import {termsFromText,summarizeReaderText,extractReaderText} from '../shared/reader-text.mjs';
import {booksFor} from '../shared/teacher-books.mjs';
test('catalog stores public sizes and download counts real received bytes',async()=>{
 const book=booksFor('1А','mathematics')[0];assert.equal(bookFilename('Алгебра 11'),'algebra-11.pdf');assert.equal(book.size,26916961);assert.match(readableSize(book.size,'ru'),/^26[.,]9 МБ$/);
 const progress=[];const parts=['%PDF-1.4\n','body demo\n','%%EOF'];const stream=new ReadableStream({start(controller){for(const text of parts)controller.enqueue(new TextEncoder().encode(text));controller.close();}});
 const total=parts.join('').length;
 const blob=await fetchBookFile({url:book.url,size:5},{fetcher:async(_,opts)=>{assert.equal(opts.credentials,'omit');return new Response(stream,{headers:{'Content-Length':String(total)}});},onProgress:event=>progress.push(event)});
 assert.equal(await blob.text(),parts.join(''));assert.deepEqual(progress.map(x=>x.loaded),[0,9,19,total]);assert.ok(progress.every(x=>x.total===total));
});
test('download rejects a non-PDF and honors abort',async()=>{
 await assert.rejects(fetchBookFile({url:'https://example.test'},{fetcher:async()=>new Response('<html>not a book</html>')}),{message:'not_pdf'});
 const abort=new AbortController();abort.abort();await assert.rejects(fetchBookFile({url:'https://example.test'},{signal:abort.signal,fetcher:async()=>new Response('%PDF-1.4')}),{name:'AbortError'});
});
test('local Aliya summary is extractive and terms derive from the selected text',()=>{
 const text='Алгоритм задаёт понятную последовательность действий. Этот алгоритм удобно проверять на простом примере. Переменные помогают записать промежуточный результат.';
 const scored=termsFromText(text);assert.deepEqual(scored[0],{word:'алгоритм',count:2});
 assert.match(summarizeReaderText(text),/Алгоритм задаёт/);assert.doesNotMatch(summarizeReaderText(text),/неизвестная выдумка/);
});

test('Tajik textbook extraction fixes legacy font encodings and joins broken lines without rewriting other Cyrillic',()=>{
 const parts=[{str:'Њама ба тарафи вай нигоњ карданд.',hasEOL:true},{str:'Эраљ тирро гирифта, ба дарах-',hasEOL:true},{str:'ти наздик андохт.',hasEOL:true},{str:'7',hasEOL:true}];
 assert.equal(extractReaderText(parts,'Адабиёти тоҷик - 5'),'Ҳама ба тарафи вай нигоҳ карданд. Эраҷ тирро гирифта, ба дарахти наздик андохт.');
 assert.equal(extractReaderText([{str:'Љубљана'}],'Географија'),'Љубљана');
});
