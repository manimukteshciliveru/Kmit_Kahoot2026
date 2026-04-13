import { useEffect, useRef } from 'react';

const ParticlesBG = ({ theme = 'dark' }) => {
    const canvasRef = useRef(null);
    const mouseRef = useRef({ x: null, y: null, radius: 150 });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let particles = [];
        let animationFrame;

        const particleCount = 80;

        class Particle {
            constructor() {
                this.init();
            }

            init() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.size = Math.random() * 2 + 1;
                this.speedX = (Math.random() - 0.5) * 0.8;
                this.speedY = (Math.random() - 0.5) * 0.8;
                
                const colors = theme === 'light' 
                    ? ['#7B2FBE', '#FF9900', '#4F46E5'] 
                    : ['#FFCC02', '#7B2FBE', '#FFFFFF'];
                
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.opacity = theme === 'light' ? 0.35 : 0.25;
            }

            update() {
                // Mouse Interactivity - Gentle Attraction/Repulsion Repel
                if (mouseRef.current.x !== null) {
                    let dx = mouseRef.current.x - this.x;
                    let dy = mouseRef.current.y - this.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < mouseRef.current.radius) {
                        let forceDirectionX = dx / distance;
                        let forceDirectionY = dy / distance;
                        let maxDistance = mouseRef.current.radius;
                        let force = (maxDistance - distance) / maxDistance;
                        let directionX = forceDirectionX * force * 4;
                        let directionY = forceDirectionY * force * 4;
                        this.x -= directionX;
                        this.y -= directionY;
                    }
                }

                this.x += this.speedX;
                this.y += this.speedY;

                if (this.x > canvas.width) this.x = 0;
                else if (this.x < 0) this.x = canvas.width;
                if (this.y > canvas.height) this.y = 0;
                else if (this.y < 0) this.y = canvas.height;
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.speedX * 5);
                
                ctx.beginPath();
                const shapeType = Math.floor((this.x + this.y) % 3);
                if (shapeType === 0) {
                    ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                } else if (shapeType === 1) {
                    ctx.rect(-this.size, -this.size, this.size * 2, this.size * 2);
                } else {
                    ctx.moveTo(0, -this.size * 1.5);
                    ctx.lineTo(this.size * 1.5, 0);
                    ctx.lineTo(0, this.size * 1.5);
                    ctx.lineTo(-this.size * 1.5, 0);
                    ctx.closePath();
                }

                ctx.fillStyle = this.color;
                ctx.shadowBlur = theme === 'dark' ? 12 : 0;
                ctx.shadowColor = this.color;
                ctx.globalAlpha = this.opacity;
                ctx.fill();
                ctx.restore();
            }
        }

        const connect = () => {
            for (let a = 0; a < particles.length; a++) {
                for (let b = a; b < particles.length; b++) {
                    let dx = particles[a].x - particles[b].x;
                    let dy = particles[a].y - particles[b].y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 110) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.strokeStyle = particles[a].color;
                        ctx.lineWidth = 0.6;
                        ctx.globalAlpha = theme === 'light' ? 0.08 : 0.05;
                        ctx.moveTo(particles[a].x, particles[a].y);
                        ctx.lineTo(particles[b].x, particles[b].y);
                        ctx.stroke();
                        ctx.restore();
                    }
                }
            }
        }

        const createParticles = () => {
            particles = [];
            for (let i = 0; i < particleCount; i++) {
                particles.push(new Particle());
            }
        };

        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            connect();
            animationFrame = requestAnimationFrame(animate);
        };

        const handleResize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            createParticles();
        };

        const handleMouseMove = (e) => {
            mouseRef.current.x = e.clientX;
            mouseRef.current.y = e.clientY;
        };

        const handleMouseLeave = () => {
            mouseRef.current.x = null;
            mouseRef.current.y = null;
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseleave', handleMouseLeave);
        handleResize();
        animate();

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseleave', handleMouseLeave);
            cancelAnimationFrame(animationFrame);
        };
    }, [theme]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 1,
                pointerEvents: 'none',
                opacity: 0.9
            }}
        />
    );
};

export default ParticlesBG;
