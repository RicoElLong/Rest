from pathlib import Path
import json, math, shutil
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
 c.drawImage(ImageReader(im),x,y,w,h)

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
 text(c,40,H-152,titles[p],10,'Sans',fg)
 right(c,W-40,H-152,f'0{p+1} / 04',9,'Sans',gold)
 line(c,40,80,W-40,80,gold,.3)
 text(c,40,63,'Самара, ул. Лейтенанта Шмидта, 1В  ·  +7 (892) 000-00-00',7,'Sans',fg)
 text(c,40,49,'Цены из каталога сайта · предварительные. «—» — выход не указан.',6.8,'Sans',fg)
 text(c,40,36,'Макет для согласования · '+styles[v][1],6.5,'Sans',gold)
 return fg,gold

def section(c,cat,x,y,width,fg,gold,v):
 title=next(k['title'] for k in data['categories'] if k['id']==cat)
 if v==4:
  text(c,x,y,'◇',11,'Sans',gold);x+=18;width-=18
 text(c,x,y,title,13 if width<300 else 15,'Bold',gold);y-=12
 line(c,x,y,x+width,y,gold,.35)
 right(c,x+width-72,y-10,'Выход',6.5,'Sans',gold);right(c,x+width,y-10,'Цена',6.5,'Sans',gold);y-=25
 rows=[i for i in data['items'] if i['categoryId']==cat]
 for item in rows:
  price=f"{item['priceRub']:,}".replace(',',' ')+' ₽'
  weight=f"{item['weightGrams']} г" if item['weightGrams'] else '—'
  names=wrap(item['name'],width-115,10.5 if width>300 else 10)
  for idx,s in enumerate(names):text(c,x,y-idx*14,s,10.5 if width>300 else 10,'Serif',fg)
  right(c,x+width-72,y,weight,9,'Sans',fg);right(c,x+width,y,price,10,'Sans',gold)
  y-=max(1,len(names))*14+(9 if v==2 else 12)
 return y-14

for v,(slug,label) in enumerate(styles):
 path=OUT/(slug+'.pdf');c=canvas.Canvas(str(path),pagesize=(W,H));c.setTitle(label+' — Дети лейтенанта Шмидта');c.setAuthor('Ресторан «Дети лейтенанта Шмидта»')
 for p,cats in enumerate(groups):
  fg,gold=chrome(c,v,p);y=H-190
  if v==2:
   hero=next(i for i in data['items'] if i['categoryId']==cats[0]);coverphoto(c,hero,40,y-80,W-80,80)
   text(c,47,y-72,'Временная иллюстрация',6,'Sans','#ffffff');y-=105
  if v==1:
   # Two balanced columns: one compact chapter per category, preserving order.
   left=cats[:1] if p!=3 else cats[:2];rightcats=[k for k in cats if k not in left]
   for col,cs in enumerate([left,rightcats]):
    x=40+col*267;yy=y
    for cat in cs:yy=section(c,cat,x,yy,248,fg,gold,v)
   line(c,W/2,105,W/2,y+8,gold,.3)
  else:
   if v==4:
    text(c,40,y,'ВОЛЖСКИЙ АВАНТЮРИЗМ',8,'Sans',gold);y-=30
   # Photo layout uses slightly tighter rows to leave generous image space.
   for cat in cats:
    y=section(c,cat,40,y,W-80,fg,gold,v)
  if y<85:raise ValueError((slug,p,y))
  c.showPage()
 c.save()
 doc=fitz.open(path);alltext=''.join(page.get_text() for page in doc)
 for item in data['items']:
  assert item['name'] in alltext.replace('\n',' '), (slug,item['name'])
 pix=doc[0].get_pixmap(matrix=fitz.Matrix(.9,.9));pix.save(str(OUT/(slug+'.png')))
 
 print(slug,len(doc),path.stat().st_size)
# A single comparison image.
thumbs=[]
for slug,label in styles:
 im=Image.open(OUT/(slug+'.png')).convert('RGB');im.thumbnail((350,495));thumbs.append((im,label))
board=Image.new('RGB',(5*382,565),'#152219');d=ImageDraw.Draw(board);font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',15)
for j,(im,label) in enumerate(thumbs):
 x=j*382+16;board.paste(im,(x,16));d.text((x,527),str(j+1)+'. '+label,font=font,fill='#e2c693')
board.save(str(OUT/'5-menu-variants.jpg'),quality=92)
