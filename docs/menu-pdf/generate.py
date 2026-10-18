from pathlib import Path
import json, math
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image,ImageDraw,ImageFont
import fitz
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'docs/menu-pdf'
data=json.loads((ROOT/'assets/menu.json').read_text())
for n,f in [('Serif','DejaVuSerif.ttf'),('Bold','DejaVuSerif-Bold.ttf'),('Sans','DejaVuSans.ttf')]:
 pdfmetrics.registerFont(TTFont(n,'/usr/share/fonts/truetype/dejavu/'+f))
W,H=595.28,841.89
G='#080f0b'; GOLD='#d8bc83'; INK='#ece3ce'; MUTED='#9fa99c'
groups=[['grill','khachapuri'],['hot-appetizers','soups','fish'],['salads','cold-appetizers'],['sides','sauces','desserts-drinks']]
titles=['Огонь и хлеб','Тепло застолья','Начало вечера','Последние штрихи']
styles=[('01-classic','Волжская классика'),('02-compact','Кабинет ресторатора'),('03-photographic','Гастрономический альбом'),('04-print','Латунь и бумага'),('05-art-deco','Вечер на Волге')]
def text(c,x,y,s,size=10,font='Serif',color=INK):
 c.setFillColor(HexColor(color));c.setFont(font,size);c.drawString(x,y,str(s))
def right(c,x,y,s,size=10,font='Sans',color=INK):
 c.setFillColor(HexColor(color));c.setFont(font,size);c.drawRightString(x,y,str(s))
def line(c,x,y,x2,y2,color=GOLD,width=.5):
 c.setStrokeColor(HexColor(color));c.setLineWidth(width);c.line(x,y,x2,y2)
def wrap(s,width,size=11,font='Serif'):
 result=[];cur=''
 for word in s.split():
  v=(cur+' '+word).strip()
  if cur and pdfmetrics.stringWidth(v,font,size)>width:result.append(cur);cur=word
  else:cur=v
 if cur:result.append(cur)
 return result

def image_for(item):
 p=item['placeholderImage'];im=Image.open(ROOT/p['src']).convert('RGB')
 if p['size']!='cover':
  sx,sy=[float(v.strip('%'))/100 for v in p['size'].split()];px,py=[float(v.strip('%'))/100 for v in p['position'].split()]
  w,h=im.width/sx,im.height/sy;x=(im.width-w)*px;y=(im.height-h)*py;im=im.crop((round(x),round(y),round(x+w),round(y+h)))
 return im

def coverphoto(c,item,x,y,w,h):
 im=image_for(item);r=w/h
 if im.width/im.height>r:
  ww=im.height*r;im=im.crop(((im.width-ww)/2,0,(im.width+ww)/2,im.height))
 else:
  hh=im.width/r;im=im.crop((0,(im.height-hh)/2,im.width,(im.height+hh)/2))
 im.thumbnail((1000,750))
 encoded=BytesIO();im.save(encoded,format='JPEG',quality=86,optimize=True);encoded.seek(0)
 c.drawImage(ImageReader(encoded),x,y,w,h)

def chrome(c,v,p):
 light=v==3;bg='#f3eddf' if light else G;fg='#17291e' if light else INK;gold='#826331' if light else GOLD
 c.setFillColor(HexColor(bg));c.rect(0,0,W,H,fill=1,stroke=0)
 if v in [0,4]:
  c.setStrokeColor(HexColor(gold));c.setLineWidth(.6);c.rect(20,20,W-40,H-40)
 if v==4:
  for x in [27,W-27]:line(c,x,42,x,H-42,gold,.3)
  for x in [20,W-20]:
   c.setFillColor(HexColor(gold));pa=c.beginPath();pa.moveTo(x,H/2+7);pa.lineTo(x+4,H/2);pa.lineTo(x,H/2-7);pa.lineTo(x-4,H/2);pa.close();c.drawPath(pa,fill=1,stroke=0)
 c.drawImage(str(ROOT/'assets/logo-car-compatible.png'),40,H-86,108,36,mask='auto')
 text(c,166,H-56,'ДЕТИ ЛЕЙТЕНАНТА',11,'Serif',fg);text(c,166,H-77,'ШМИДТА',20,'Bold',gold)
 right(c,W-40,H-56,'РЕСТОРАН',8,'Sans',gold);right(c,W-40,H-72,'САМАРА · ВОЛГА',7,'Sans',fg)
 line(c,40,H-102,W-40,H-102,gold)
 text(c,40,H-132,'Гастрономическая карта',22 if v!=4 else 23,'Serif',gold)
 text(c,40,H-152,current_title,12,'Serif',fg)
 right(c,W-40,H-152,f'{p+1:02d} / {total_pages:02d}',9,'Sans',gold)
 line(c,40,80,W-40,80,gold,.3)
 text(c,40,63,'Самара, ул. Лейтенанта Шмидта, 1В  ·  +7 (892) 000-00-00',7,'Sans',fg)
 text(c,40,49,'Цены из каталога сайта · предварительные. «—» — выход не указан.',6.8,'Sans',fg)
 text(c,40,36,'Фото — временные иллюстрации · '+styles[v][1],6.5,'Sans',gold)
 return fg,gold

from io import BytesIO

def dish_card(c,item,x,top,w,rowheight,v,fg,gold):
    height=rowheight-18
    bottom=top-height
    coverphoto(c,item,x,bottom,w,height)
    fs=10 if v==1 else 13 if v==2 else 12
    leading=fs*1.3
    names=wrap(item['name'],w-26,fs,'Serif')
    band=max(95,52+len(names)*leading)
    # Transparent black-green gradient keeps the food visible behind the copy.
    c.saveState()
    c.setFillColor(HexColor(G))
    steps=100
    for n in range(steps):
        t=n/(steps-1)
        c.setFillAlpha(.94*(1-t)**.65)
        c.rect(x,bottom+n*band/steps,w,band/steps+.2,fill=1,stroke=0)
    c.restoreState()
    for n,name in enumerate(names):
        text(c,x+13,bottom+47+(len(names)-1-n)*leading,name,fs,'Serif','#ffffff')
    price=f"{item['priceRub']:,}".replace(',',' ')+' ₽'
    weight='Выход: '+(str(item['weightGrams'])+' г' if item['weightGrams'] else '—')
    text(c,x+13,bottom+21,weight,8,'Sans','#f0e9db')
    right(c,x+w-13,bottom+21,price,11 if v==1 else 13,'Sans',GOLD)
    if v in [0,4]:
        c.setStrokeColor(HexColor(GOLD));c.setLineWidth(.4)
        c.rect(x,bottom,w,height,fill=0,stroke=1)
    if v==4:
        line(c,x+13,bottom+37,x+w-13,bottom+37,GOLD,.3)

for v,(slug,label) in enumerate(styles):
    capacity=[4,6,3,6,4][v]
    pages=[]
    for cat in data['categories']:
        items=[i for i in data['items'] if i['categoryId']==cat['id']]
        for start in range(0,len(items),capacity):
            pages.append((cat['title']+(' · продолжение' if start else ''),items[start:start+capacity]))
    total_pages=len(pages)
    path=OUT/(slug+'.pdf');c=canvas.Canvas(str(path),pagesize=(W,H))
    c.setTitle(label+' — Дети лейтенанта Шмидта');c.setAuthor('Ресторан «Дети лейтенанта Шмидта»')
    for p,(current_title,items) in enumerate(pages):
        fg,gold=chrome(c,v,p)
        cols=[2,3,1,2,2][v];rows=math.ceil(capacity/cols)
        gutter=20 if cols!=3 else 14
        width=(W-80-(cols-1)*gutter)/cols
        rh=550/rows
        for n,item in enumerate(items):
            x=40+(n%cols)*(width+gutter);top=H-181-(n//cols)*rh
            dish_card(c,item,x,top,width,rh,v,fg,gold)
        c.showPage()
    c.save()
    doc=fitz.open(path);alltext=' '.join(page.get_text().replace('\n',' ') for page in doc)
    for item in data['items']:assert item['name'] in alltext,(slug,item['name'])
    photo_count=sum(len(page.get_image_info())-1 for page in doc)
    assert photo_count==48,(slug,photo_count)
    for page in doc:
        for b in page.get_text('dict')['blocks']:
            if b['type']!=0:continue
            for l in b['lines']:
                for span in l['spans']:
                    x0,y0,x1,y1=span['bbox']
                    assert 0<=x0<x1<=W and 0<=y0<y1<=H,(slug,span)
    doc[0].get_pixmap(matrix=fitz.Matrix(.9,.9)).save(str(OUT/(slug+'.png')))
    print(slug,len(doc),'pages;',photo_count,'dish photos;',path.stat().st_size,'bytes')
thumbs=[]
for slug,label in styles:
    im=Image.open(OUT/(slug+'.png')).convert('RGB');im.thumbnail((350,495));thumbs.append((im,label))
board=Image.new('RGB',(5*382,565),'#152219');d=ImageDraw.Draw(board);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
for j,(im,label) in enumerate(thumbs):
    x=j*382+16;board.paste(im,(x,16));d.text((x,527),str(j+1)+'. '+label,font=font,fill='#e2c693')
board.save(str(OUT/'5-menu-variants.jpg'),quality=92)
